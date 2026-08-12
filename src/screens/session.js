import { html, raw, escapeHtml, escapeAttr as escapeHtmlAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=374";
import { socialAccounts, chatStarters, connectorDocs } from "../mocks.js?v=88";
import {
  getConnectedProfiles,
  buildConnectedProfileItems,
  renderProfileTag,
  renderProfileEchoCard,
  profileForNetwork,
  NETWORK_ICON_BY_PLATFORM,
  NETWORK_LABEL,
  PROFILE_SEARCH_THRESHOLD,
} from "../social-profiles.js?v=59";
import { FORMATS, formatsForNetwork, defaultFormatFor, clipFormatItems } from "../clip-formats.js?v=39";
import { CLIP_SUBTITLE_ITEMS, CLIP_SUBTITLE_LABEL } from "../clip-subtitles.js?v=1";
import { getSessionById, getSessions, subscribe as subscribeSessions } from "../sessions-store.js?v=36";
import { getContextById, getContexts, getDefaultContext, updateContext } from "../contexts-store.js?v=70";
import { isNewUser } from "../user-mode.js?v=22";
import {
  getThread,
  sendMessage,
  postAssistantChoice,
  postAssistantMessage,
  postUserTurn,
  postUserProfilesTurn,
  postSelectionEcho,
  postDraftResult,
  postExtractionResult,
  postClipExtractionTurn,
  startPending,
  finishPending,
  subscribe,
  submitAssistantChoice,
  sendConnectorMessage,
  markConnectPromptResolved,
  toggleTopPostsWidgetPick,
  answerTopPostsWidget,
} from "../assistant.js?v=92";
import { iconFor as fileIconForKind } from "../file-kinds.js?v=20";
import { getSources, getIdeas, extractVideoIdeas } from "../library.js?v=86";
import { wireLibraryActions, renderSourcesBulkBar, renderIdeasBulkBar } from "../library-actions.js?v=75";
import {
  renderInto as renderComposerMentions,
  removeMention as removeComposerMention,
  subscribe as subscribeComposerMentions,
  addMention as addComposerMention,
} from "../composer-mentions.js?v=60";
import { getPosts, addPostDraft, setSubtitleStyle, subscribe as subscribePostsStore } from "../posts-store.js?v=65";
import { startDraftFlow, executeDraft, executeDraftBatch, getAnglesForIdea } from "../draft-flow.js?v=90";
import { startActionPickerFlow, handleActionPick } from "../start-flow.js?v=72";
import * as topPostsFlow from "../top-posts-flow.js?v=112";
import {
  renderTopPostsBoard,
  renderTopPostEcho,
  renderTopPostsWidget,
  TOP_POSTS_LIMIT,
} from "../components/top-post-card.js?v=118";
import { getTopPost } from "../top-posts-store.js?v=79";
import { renderEmptyState } from "../components/empty-state.js?v=1";
import * as sidebarWizard from "../sidebar-wizard.js?v=82";
import * as inlineQuestion from "../inline-question.js?v=48";
import * as clipStudio from "../clip-studio.js?v=56";
import * as batchStudio from "../batch-studio.js?v=4";
import { askConnector } from "../connector-ask.js?v=37";
import { getConnectedConnectors, findConnector, setConnectorStatus } from "../connectors-store.js?v=57";
import { renderConnectorLogo } from "../connectors-view.js?v=39";
import {
  getActiveConnector,
  clearActiveConnector,
  subscribe as subscribeComposerConnector,
} from "../composer-connector.js?v=1";
import { isFlagOn } from "../feature-flags.js?v=19";
import { getBriefById, getStarterTopics } from "../briefs-store.js?v=42";
import { BRIEF_CHAT_HANDOFF, attachBriefToChat, openBriefInChat } from "../brief-flow.js?v=15";
import { PILLAR_CHAT_HANDOFF, attachPillarToChat } from "../pillar-flow.js?v=9";
import { getLaneById } from "../research-store.js?v=35";
import * as contextBuilder from "../context-builder.js?v=341";
import { renderPicker } from "./_analyse-common.js?v=55";
import { renderSourceCard } from "../components/source-card.js?v=33";
import { renderIdeaCard } from "../components/idea-card.js?v=27";
import { renderCompactIdeaCard } from "../components/idea-card-compact.js?v=2";
import {
  contentState,
  renderContentWorkspace as renderSharedContentWorkspace,
  rerenderContentWorkspaceBody,
  renderContentEmptyState,
} from "../components/content-workspace.js?v=25";
import { open as openVideoClipsModal } from "../components/video-clips-modal.js?v=87";
import { open as openChatPickerModal } from "../components/chat-picker-modal.js?v=94";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=95";
import { open as openConnectorsModal } from "../components/connectors-modal.js?v=41";
import { dropzoneHTML } from "../components/dropzone.js?v=1";
import {
  classifyFile,
  startFileUpload,
  startUrlImport,
  startConnectorImport,
  startTextImport,
  getSources as getStreamSources,
  subscribeSources,
  subscribeUploads,
  pushScriptedSource,
  completeScriptedSource,
  updateSourceClips,
  extractClipsForSource,
  setSourceIdeaCount,
  addReadySource,
} from "../sources-stream.js?v=84";
import { renderClipCard } from "../components/clip-card.js?v=48";
import { onFeedbackClick } from "../components/feedback-control.js?v=3";
import { showToast } from "../components/toast.js?v=21";
// The composer's Add menu reaches Content Ideas through this picker; the catalog
// gives the picked topic's source its icon, matching the card it came from.
import { openIdeaPicker, openPillarPicker } from "../components/research-modals.js?v=82";
import { findResearchSource } from "../research-catalog.js?v=14";
import {
  openDrafts as openDraftsPanel,
  openIdeas as openIdeasPanel,
  openClips as openClipsPanel,
  getMode as getRightPanelMode,
  subscribe as subscribeRightPanel,
} from "../components/right-panel.js?v=508";
import { setHandoff, consumeHandoff, hasHandoff } from "../handoff.js?v=20";
import { startTopicChat, TOPIC_CHAT_HANDOFF } from "../topic-flow.js?v=31";
import { parseHashParams, setHashQuery } from "../url-state.js?v=21";
import { updateLoadingWatchdog, stopThinkingTimer } from "./session/thinking-chip.js?v=50";
import { startIntakeLifecycle } from "./session/intake-lifecycle.js?v=58";
import { rebindWizardKeyboard } from "./session/wizard-keyboard.js?v=73";
// Pure thread-turn renderers — shared with the component handoff gallery so
// the previews there never drift from the app (handoff/components.html).
import {
  SWITCH_SKELETON_HTML,
  renderMessageBubble,
  renderSourceIntakeTurn,
  renderChoiceTurn,
  renderNotice,
  renderSystemNotice,
  renderExtractingNotice,
  renderResultCard,
} from "./session/thread-turns.js?v=1";

// Default composer placeholder — restored whenever no connector is attached.
// A connected connector swaps it for "Ask {name} anything…".
const COMPOSER_DEFAULT_PLACEHOLDER = "Ask a follow-up, or refine a draft…";

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
    // New Chat starts pre-bound to the default playbook so the composer pill
    // shows a real selection (and the first send uses it instead of
    // auto-launching the create-a-playbook wizard). The user can swap it via
    // the composer pill before sending. Creation flows (welcome-alt-*,
    // new-ctx-*) never hit this "new" branch.
    // A chat always needs a Playbook — pre-bind the default one whenever
    // we land on a fresh `/session/new` or `/session/new-<id>`. The
    // user can still swap it via the composer pill before the first send.
    contextId:
      q.contextId || (params.id === "new" || params.id.startsWith("new-") ? getDefaultContext()?.id || null : null),
  };
  // Reset selection when switching to a different chat. Tab + URL-param
  // changes within the same session keep the selection intact.
  const isSessionSwitch = previousSessionId !== session.id;
  if (isSessionSwitch) {
    clearSelection();
    previousSessionId = session.id;
  }

  // Clip Studio — a dedicated full-page "Extract video clips" flow runs in its
  // own `clip-studio-*` session. Start the upload stage SYNCHRONOUSLY here (on
  // first render, before innerHTML below) so the upload box paints with zero
  // flicker. GATE on the one-shot handoff so a re-render AFTER the flow exits
  // (e.g. openDrafts writing a URL param → router re-runs renderSession) does
  // NOT relaunch the studio.
  if (session.id.startsWith("clip-studio-") && !clipStudio.isActive(session.id)) {
    if (consumeHandoff("pendingStartClipStudio"))
      clipStudio.start(session.id, { contextId: getDefaultContext()?.id || null });
  }

  // Batch Studio — dedicated "Batch from a source" intake in its own `batch-*`
  // session. Same one-shot-handoff gate as Clip Studio so a re-render after the
  // user navigates away doesn't relaunch it. Pre-selects the default Playbook.
  if (session.id.startsWith("batch-") && !batchStudio.isActive(session.id)) {
    if (consumeHandoff("pendingStartBatch"))
      batchStudio.start(session.id, { contextId: getDefaultContext()?.id || null });
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

  // Switching to a different chat: briefly show skeleton bubbles where the
  // conversation will land, so the swap reads as "loading this chat" rather
  // than an instant content pop. Only for a started conversation in the normal
  // layout (the helper self-skips the empty hero / wizard / clip-studio).
  if (isSessionSwitch) showSwitchSkeleton(target);

  // FIND-B: return a cleanup so the router tears down per-screen state on
  // route change (and not only on the next session mount). Without this,
  // navigating from /session/:id to /ideas left the assistant subscribers
  // wired against stale DOM nodes for the lifetime of the next route.
  return () => {
    if (currentUnsubscribe) {
      currentUnsubscribe();
      currentUnsubscribe = null;
    }
    if (currentListenerController) {
      currentListenerController.abort();
      currentListenerController = null;
    }
  };
}

// A conversation has "started" (→ show the thread + bottom composer instead of
// the empty "What are you working on?" hero) once any of these land: a real user
// message, the assistant-choice posted by a starter, a rich assistant variant,
// or a source intake (Batch-from-a-source handoff or an Add-source on a fresh
// chat). Shared by renderAssistantPanel (layout) and the offThread subscription
// (so the empty → started transition triggers a full re-render that adds the
// bottom composer).
function isThreadStarted(messages) {
  return (
    messages.some((m) => m.role === "user") ||
    messages.some((m) => m.role === "assistant-choice") ||
    messages.some((m) => m.role === "assistant" && m.variant) ||
    messages.some((m) => m.role === "source-intake")
  );
}

// Skeleton bubbles shown for a short beat when switching chats. Alternating
// assistant (left) / user (right) placeholders with a shimmer, so the
// conversation area reads as "loading" before the real thread swaps in.
// Render the skeleton into the thread, then restore the real content after a
// short delay. Synchronous innerHTML swap (before the browser paints) means the
// real thread never flashes first. Self-skips when there's no started thread to
// cover (empty hero, wizard, clip-studio — those layouts have no
// `.session__assistant-thread`, or carry the hero instead of a thread).
function showSwitchSkeleton(root) {
  const threadEl = root.querySelector(".session__assistant-thread[data-assistant-thread]");
  if (!threadEl) return;
  if (threadEl.querySelector("[data-empty-chat]")) return; // empty conversation — nothing to load
  const real = threadEl.innerHTML;
  threadEl.innerHTML = SWITCH_SKELETON_HTML;
  threadEl.classList.add("is-switching");
  window.setTimeout(() => {
    // Bail if the user switched again (this node was replaced/detached).
    if (!document.contains(threadEl)) return;
    threadEl.classList.remove("is-switching");
    threadEl.innerHTML = real;
    threadEl.scrollTop = threadEl.scrollHeight;
  }, 340);
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

  // Clip Studio — dedicated full-page "Extract video clips" flow (upload →
  // analyzing → clips). Must precede the wizard / inline-question branches so
  // it owns the panel while active.
  if (clipStudio.isActive(session.id)) {
    return renderClipStudio(session, attachedContext);
  }
  // Batch Studio — dedicated full-page "Batch from a source" intake (upload 1+
  // sources + pick a Playbook → new chat). Owns the panel while active.
  if (batchStudio.isActive(session.id)) {
    return renderBatchStudio(session);
  }
  // Wizard mode — when sidebar-wizard has state for this session, replace the
  // normal thread + composer with the analyse-style wizard chrome.
  if (sidebarWizard.isActive(session.id)) {
    return renderAssistantPanelWizard(session);
  }
  // Top-posts milker — the winner-selection grid takes over the panel (like
  // Batch / Clip Studio) before any inline-question step kicks in.
  if (topPostsFlow.isPickerActive(session.id)) {
    return renderTopPostsPickerScreen(session);
  }
  // Inline single-question mode — same chrome as the wizard but for one-shot
  // pickers (e.g. "Which profile to draft for?").
  if (inlineQuestion.isActive(session.id)) {
    return renderAssistantPanelQuestion(session);
  }

  // Empty conversation = nothing has happened yet. Hides the empty hero once any
  // rich turn lands (user msg, assistant variant, the assistant-choice posted by
  // a starter, or a source landing) so the in-flight work stays visible across
  // remounts. See isThreadStarted.
  const isEmptyConversation = !isThreadStarted(thread);

  // The composer markup is the same regardless of where it appears — bottom
  // of the panel (default) or inline inside the empty hero. We render it
  // once and place it via `${composerMarkup}` so click handlers (delegated
  // on #app) keep working in both positions.
  const composerMarkup = renderComposer(attachedContext, session, isEmptyConversation);
  return html`
    <aside class="session__assistant" aria-label="Assistant panel">
      <div
        class="session__assistant-thread"
        id="assistantThread"
        data-assistant-thread
        aria-live="polite"
        aria-atomic="false"
      >
        ${isEmptyConversation
          ? raw(renderEmptyHero(session.id, composerMarkup))
          : raw(renderThread(thread, session.id))}
      </div>
      ${isEmptyConversation ? "" : raw(composerMarkup)}
    </aside>
  `;
}

// ─── Clip Studio (dedicated "Extract video clips" flow) ────────────────────
// Three full-page stages, all rooted on `.session__assistant` (+ a
// `clip-studio--{stage}` modifier) so drag/drop binding and the
// refreshAssistantAside node-swap keep working. See clip-studio.js for state.

// Format a seconds count as a friendly "~2 min" / "45 sec" remaining label.
function fmtEta(totalSec) {
  if (totalSec >= 60) {
    const m = Math.round(totalSec / 60);
    return `${m} min`;
  }
  return `${Math.max(5, totalSec)} sec`;
}

// Config catalogs for the upload/config screen.
const CLIP_DURATIONS = [
  { value: "auto", label: "Auto" },
  { value: "short", label: "Up to 30s" },
  { value: "medium", label: "30–60s" },
  { value: "long", label: "60–90s" },
];
const CLIP_OUTPUT_FORMATS = ["9:16", "16:9", "1:1"]; // keys into FORMATS
const CLIP_CAPTION_STYLES = [
  { value: "none", label: "None" },
  { value: "bold", label: "Bold" },
  { value: "clean", label: "Clean" },
  { value: "caption", label: "Caption" },
];
const CLIP_CAPTION_SAMPLE = "Bring your story to life";
const CLIP_NETWORKS = [
  { id: "tiktok", label: "TikTok", icon: "ap-icon-tiktok-official" },
  { id: "instagram", label: "Instagram", icon: "ap-icon-instagram-official" },
  { id: "linkedin", label: "LinkedIn", icon: "ap-icon-linkedin-official" },
  { id: "x", label: "X", icon: "ap-icon-x-official" },
  { id: "facebook", label: "Facebook", icon: "ap-icon-facebook-official" },
];
const CLIP_NET_ICON = Object.fromEntries(CLIP_NETWORKS.map((n) => [n.id, n.icon]));
// Output format is the real choice; the network icons are just an indication of
// which networks each ratio suits best.
const CLIP_FORMATS_UI = [
  { id: "9:16", label: "Vertical", nets: ["tiktok", "instagram"] },
  { id: "1:1", label: "Square", nets: ["linkedin", "facebook"] },
  { id: "16:9", label: "Landscape", nets: ["x", "linkedin"] },
  { id: "4:5", label: "Portrait", nets: ["instagram", "facebook"] },
];
// Clip duration — same idea: the network icons indicate which networks favour
// that length (network = guidance, not a hard filter).
const CLIP_DURATIONS_UI = [
  { id: "auto", label: "Auto", sub: "Smart pick", nets: [] },
  { id: "short", label: "≤ 30s", sub: "Shorts & Reels", nets: ["tiktok", "instagram"] },
  { id: "medium", label: "30–60s", sub: "Feed clips", nets: ["instagram", "facebook"] },
  { id: "long", label: "60–90s", sub: "Long-form", nets: ["linkedin", "x"] },
];

// Origin sub-line for a staged batch source, shown in the source-card's meta row
// (in place of the usual "N ideas · Processed · Added X").
function batchSourceSub(s) {
  if (s.origin === "url") return "Public link";
  if (s.origin === "text") return "Pasted text";
  if (s.origin === "connector") {
    return s.connector?.name ? `${s.connector.name}${s.kind ? ` · ${s.kind}` : ""}` : "Connected source";
  }
  return s.kind ? `${s.kind} · From your computer` : "From your computer";
}

// Batch Studio — single-stage source-intake screen. The hero is one unified
// "drop & paste" card: drag/drop or browse files, AND a smart field where you
// paste or type a link OR text (auto-detected on add — a bare URL becomes a
// link, anything else becomes a pasted-text source; pasting files uploads them).
// Below it: the staged-source list + a Playbook picker, and the CTA hands the
// staged sources off to a fresh chat (see the batch wiring in bindSession).
//
// The intake card lives OUTSIDE [data-batch-rest]; staging-loader ticks repaint
// only the rest (list + commit), so the field is never clobbered mid-typing.

// Shared "How it works" flow block (styles/components/workflow-flow.css) — used
// by both the Batch and Clip studios so the two workflows read identically. Each
// step is a coloured icon chip + title + a sentence, laid on a gradient rail
// (input → AI → output). Marketing-grade, icons + text only, no illustrations.
// `tone` drives the chip colour: "in" (blue) · "ai" (mermaid gradient) · "out"
// (green).
function buildWorkflowFlow(steps) {
  return `
    <ol class="workflow-flow">
      ${steps
        .map(
          (s) => `
        <li class="workflow-flow__step workflow-flow__step--${s.tone}">
          <span class="workflow-flow__head">
            <span class="workflow-flow__chip workflow-flow__chip--${s.tone}">
              <i class="${s.icon}" aria-hidden="true"></i>
            </span>
            <span class="workflow-flow__title">${s.title}</span>
          </span>
          <span class="workflow-flow__text">${s.text}</span>
        </li>`,
        )
        .join("")}
    </ol>`;
}

const BATCH_STUDIO_STEPS = [
  {
    tone: "in",
    icon: "ap-icon-upload",
    title: "Add your sources",
    text: "Upload files, paste a link, or drop in text — add as many as you like.",
  },
  {
    tone: "ai",
    icon: "ap-icon-archie-official",
    title: "I find the strongest ideas",
    text: "I read every source and pull out the angles genuinely worth posting about.",
  },
  {
    tone: "out",
    icon: "ap-icon-stack",
    title: "A batch of drafts",
    text: "I draft a post for each idea in your playbook's voice — ready to review and schedule.",
  },
];

function buildBatchStudioSteps() {
  return buildWorkflowFlow(BATCH_STUDIO_STEPS);
}

function renderBatchStudio(session) {
  const st = batchStudio.getState(session.id);
  if (!st) return "";

  // Connected connectors → a gated "Connected source" picker (only when the
  // connectors feature flag is on AND at least one connector is connected).
  const connectors = isFlagOn("connectors") ? getConnectedConnectors() : [];
  const connectorMenu = connectors.length
    ? `
      <details class="ap-select batch-studio__connector" data-batch-connector>
        <summary class="ap-button stroked grey batch-studio__method batch-studio__connector-trigger">
          <i class="ap-icon-link" aria-hidden="true"></i><span>Connected source</span>
        </summary>
        <div class="ap-select-dropdown batch-studio__connector-dropdown" role="listbox" aria-label="Connected sources">
          <div class="ap-select-options">
            ${connectors
              .map(
                (c) => `
              <div class="ap-select-option" data-batch-connector-pick="${escapeHtml(c.id)}" role="option">
                <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
              </div>`,
              )
              .join("")}
          </div>
        </div>
      </details>`
    : "";

  return html`
    <aside class="session__assistant batch-studio batch-studio--upload" aria-label="Batch from a source">
      <div class="batch-studio__scroll">
        <div class="batch-studio__inner">
          <div class="batch-studio__intro">
            <span class="batch-studio__ai-badge"><i class="ap-icon-archie-official" aria-hidden="true"></i>Batch</span>
            <h1 class="batch-studio__title">Turn your sources into a batch of posts</h1>
            <p class="batch-studio__sub">
              Drop files, paste a link, or paste any text — add as many sources as you like and I'll pull the strongest
              ideas and draft a set of posts.
            </p>
          </div>

          ${raw(buildBatchStudioSteps())}

          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.mp4,.mov,.mp3,.wav,.m4a,.png,.jpg,.jpeg"
            id="batchFileInput"
            data-batch-file
            multiple
            hidden
          />

          <div class="batch-studio__dropzone">
            ${raw(
              dropzoneHTML({
                lead: "Drag & drop files here",
                sub: "PDF, Word, text, video, audio or images · up to 100MB each",
                large: true,
                withInput: false,
                rootAttrs: "data-batch-dropzone",
                ariaLabel: "Add files from your computer",
                action: { label: "Browse files" },
              }),
            )}
            <div class="batch-studio__dropzone-extra">
              <span class="batch-studio__dropzone-extra-label">Or add another way</span>
              <button type="button" class="ap-button stroked grey batch-studio__method" data-batch-link>
                <i class="ap-icon-link" aria-hidden="true"></i><span>A link</span>
              </button>
              <button type="button" class="ap-button stroked grey batch-studio__method" data-batch-paste>
                <i class="ap-icon-file--text" aria-hidden="true"></i><span>Pasted text</span>
              </button>
              ${raw(connectorMenu)}
            </div>
            <div class="batch-studio__dropzone-overlay" aria-hidden="true">
              <i class="ap-icon-upload" aria-hidden="true"></i><span>Drop files to upload</span>
            </div>
          </div>

          <div data-batch-rest>${raw(renderBatchRest(session))}</div>
        </div>
      </div>
    </aside>
  `;
}

// The repaint-on-staging-change region: staged-source list + Playbook + CTA.
// Re-rendered wholesale on every batchStudio notify (add / remove / pick /
// loader tick) while the intake card above stays put. Returns a trusted HTML
// string (dynamic bits escaped by renderSourceCard / renderBatchPlaybookControl).
function renderBatchRest(session) {
  const st = batchStudio.getState(session.id);
  if (!st) return "";
  const ctx = st.contextId ? getContextById(st.contextId) : null;
  const sources = st.sources || [];
  const canStart = sources.length > 0;
  const countLabel = sources.length === 1 ? "1 source" : `${sources.length} sources`;

  const sourceList = sources.length
    ? `
      <div class="batch-studio__list" aria-label="Staged sources">
        ${sources
          .map((s) =>
            renderSourceCard({ id: s.uid, filename: s.name, kind: s.kind, iconKey: s.iconKey, status: s.status }, [], {
              staged: true,
              removeValue: s.uid,
              stagedSub: batchSourceSub(s),
            }),
          )
          .join("")}
      </div>`
    : "";

  return `
    ${sourceList}
    <div class="batch-studio__commit">
      <div class="batch-studio__commit-row">
        ${renderBatchPlaybookControl(ctx)}
        <button
          type="button"
          class="ap-button primary orange batch-studio__start"
          data-batch-start
          ${canStart ? "" : "disabled"}
        >
          <i class="ap-icon-archie-official" aria-hidden="true"></i>
          <span>Extract ideas${canStart ? ` · ${countLabel}` : ""}</span>
        </button>
      </div>
      <p class="batch-studio__field-hint muted">I'll draft every post in this playbook's voice, audience, and CTAs.</p>
    </div>
  `;
}

// Playbook picker for the Batch Studio commit group — same DS form-select shape
// as the composer's renderPlaybookControl, but full-width and its picks route
// through the `data-batch-playbook-pick` delegate (→ batchStudio.setContext)
// instead of mutating session.contextId.
function renderBatchPlaybookControl(ctx) {
  const playbooks = getContexts();
  const items = playbooks
    .map((c) => {
      const isSel = ctx && c.id === ctx.id;
      return `
        <div
          class="ap-select-option${isSel ? " selected" : ""}"
          data-batch-playbook-pick="${escapeHtml(c.id)}"
          role="option"
          aria-selected="${isSel ? "true" : "false"}"
        >
          <span class="composer-context__dot" style="background: ${dotColorVar(c.color || "grey")};"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  const valueMarkup = ctx
    ? `<span class="ap-select-value">${escapeHtml(ctx.name)}</span>`
    : `<span class="ap-select-value ap-select-placeholder">Select a playbook</span>`;
  return `
    <details class="ap-select batch-studio__playbook" data-batch-playbook>
      <summary class="ap-select-trigger" title="Choose the playbook for this chat">
        <span class="ap-select-inline-label">Playbook</span>
        ${valueMarkup}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Choose a playbook">
        <div class="ap-select-options">${items}</div>
      </div>
    </details>
  `;
}

function renderClipStudio(session, attachedContext) {
  const st = clipStudio.getState(session.id);
  if (!st) return "";
  if (st.stage === "profiles") return renderClipStudioProfiles(session, st);
  if (st.stage === "clips") return renderClipStudioClips(session, st);
  if (st.stage === "analyzing") return renderClipStudioAnalyzing(st);
  return renderClipStudioUpload(st);
}

// Output-format picker — single choice. Each option shows the networks it
// suits as an indication (the network is guidance, not a target selector).
// Shared between the setup screen and the clips-review screen (the format +
// caption choice now lives on review; see renderClipStudioClips).
function buildClipFormatCards(cfg) {
  return CLIP_FORMATS_UI.map((f) => {
    const on = cfg.format === f.id;
    const nets = f.nets
      .map((id) => `<i class="${CLIP_NET_ICON[id]} clip-studio__fmtcard-net" aria-hidden="true"></i>`)
      .join("");
    return `<button type="button" class="clip-studio__fmtcard${on ? " is-on" : ""}" data-clip-config="format" data-value="${f.id}" aria-pressed="${on}">
      <span class="clip-studio__fmtcard-shape clip-studio__fmtcard-shape--${f.id.replace(":", "-")}"></span>
      <span class="clip-studio__fmtcard-info">
        <span class="clip-studio__fmtcard-ratio">${f.id}</span>
        <span class="clip-studio__fmtcard-label">${f.label}</span>
      </span>
      <span class="clip-studio__fmtcard-nets">${nets}</span>
    </button>`;
  }).join("");
}

function buildClipCaptionCards(cfg) {
  return CLIP_CAPTION_STYLES.map((c) => {
    const on = cfg.captionStyle === c.value;
    const preview =
      c.value === "none"
        ? `<span class="clip-studio__cap-none"><i class="ap-icon-close" aria-hidden="true"></i></span>`
        : `<span class="clip-studio__cap-sample clip-studio__cap-sample--${c.value}">${CLIP_CAPTION_SAMPLE}</span>`;
    return `<button type="button" class="clip-studio__cap-card${on ? " is-on" : ""}" data-clip-config="captionStyle" data-value="${c.value}" aria-pressed="${on}">
      <span class="clip-studio__cap-preview">${preview}</span>
      <span class="clip-studio__cap-label">${c.label}</span>
    </button>`;
  }).join("");
}

// Playbook picker for the clip-studio setup — the chosen Playbook governs the
// voice/audience/CTAs of the drafts created from the clips. Mirrors the batch
// playbook control; routes through the `data-clip-playbook-pick` delegate.
function renderClipPlaybookControl(ctx) {
  const playbooks = getContexts();
  const items = playbooks
    .map((c) => {
      const isSel = ctx && c.id === ctx.id;
      return `
        <div class="ap-select-option${isSel ? " selected" : ""}" data-clip-playbook-pick="${escapeHtml(c.id)}" role="option" aria-selected="${isSel ? "true" : "false"}">
          <span class="composer-context__dot" style="background: ${dotColorVar(c.color || "grey")};"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  const valueMarkup = ctx
    ? `<span class="ap-select-value">${escapeHtml(ctx.name)}</span>`
    : `<span class="ap-select-value ap-select-placeholder">Select a playbook</span>`;
  return `
    <details class="ap-select clip-studio__select" data-clip-playbook>
      <summary class="ap-select-trigger" title="Choose the playbook for these posts">
        <span class="ap-select-inline-label">Playbook</span>
        ${valueMarkup}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Choose a playbook">
        <div class="ap-select-options">${items}</div>
      </div>
    </details>`;
}

// Playbook picker for the top-posts step 1 (account screen) — the chosen
// Playbook governs the voice of the repurposed drafts. Mirrors the batch / clip
// playbook controls; routes through the `data-topposts-playbook-pick` delegate.
function renderTopPostsPlaybookControl(ctx) {
  const playbooks = getContexts();
  const items = playbooks
    .map((c) => {
      const isSel = ctx && c.id === ctx.id;
      return `
        <div class="ap-select-option${isSel ? " selected" : ""}" data-topposts-playbook-pick="${escapeHtml(c.id)}" role="option" aria-selected="${isSel ? "true" : "false"}">
          <span class="composer-context__dot" style="background: ${dotColorVar(c.color || "grey")};"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>`;
    })
    .join("");
  const valueMarkup = ctx
    ? `<span class="ap-select-value">${escapeHtml(ctx.name)}</span>`
    : `<span class="ap-select-value ap-select-placeholder">Select a playbook</span>`;
  return `
    <details class="ap-select studio-commit__playbook" data-topposts-playbook>
      <summary class="ap-select-trigger" title="Choose the playbook for these drafts">
        <span class="ap-select-inline-label">Playbook</span>
        ${valueMarkup}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Choose a playbook">
        <div class="ap-select-options">${items}</div>
      </div>
    </details>`;
}

// Clip Studio "How it works" — same shared flow block as the Batch Studio.
const CLIP_STUDIO_STEPS = [
  {
    tone: "in",
    icon: "ap-icon-file--video",
    title: "Add your video",
    text: "Drop in a video file or paste a YouTube or Google Drive link — even a long one.",
  },
  {
    tone: "ai",
    icon: "ap-icon-archie-official",
    title: "I find the highlights",
    text: "I watch and transcribe the whole thing, then cut the strongest moments to the length you set.",
  },
  {
    tone: "out",
    icon: "ap-icon-closed-captions",
    title: "Post-ready clips",
    text: "Each clip comes captioned and drafted into a post in your playbook's voice — ready to schedule.",
  },
];

function buildClipStudioFlow() {
  return buildWorkflowFlow(CLIP_STUDIO_STEPS);
}

function renderClipStudioUpload(st) {
  const cfg = st.config || {};
  const ctx = st.contextId ? getContextById(st.contextId) : null;
  const uploadState = st.uploadState;
  const name = escapeHtml(st.sourceName || "your video");
  const durLabelFor = (d) => (d.id === "auto" ? "Auto" : `${d.label} · ${d.sub}`);
  const curDuration = CLIP_DURATIONS_UI.find((d) => d.id === cfg.duration) || CLIP_DURATIONS_UI[0];
  const durationItems = CLIP_DURATIONS_UI.map((d) => {
    const isSel = cfg.duration === d.id;
    return `<div class="ap-select-option${isSel ? " selected" : ""}" data-clip-config="duration" data-value="${d.id}" role="option" aria-selected="${isSel ? "true" : "false"}">
      <span class="ap-select-option-text">${durLabelFor(d)}</span>
      ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
    </div>`;
  }).join("");

  // Left panel: idle dropzone, or — once a video is provided — a preview frame.
  // Faux video still (inline SVG presenter scene) so the frame reads as actual
  // video content behind the loader/play.
  const frameArt = `<svg class="clip-studio__frame-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect width="320" height="180" fill="#26334d"/>
    <rect x="24" y="22" width="56" height="42" rx="6" fill="#33425f"/>
    <circle cx="268" cy="34" r="9" fill="#3a4a6b"/>
    <rect x="244" y="54" width="54" height="50" rx="6" fill="#2f3e5b"/>
    <rect x="96" y="124" width="128" height="78" rx="42" fill="#586a8c"/>
    <ellipse cx="160" cy="76" rx="42" ry="26" fill="#3a2c24"/>
    <circle cx="160" cy="96" r="36" fill="#cda484"/>
  </svg>`;
  const leftPanel = uploadState
    ? `<div class="clip-studio__preview clip-studio__preview--${uploadState}">
         <div class="clip-studio__frame" aria-hidden="true">
           ${frameArt}
           ${
             uploadState === "processing"
               ? `<span class="archie-loader clip-studio__frame-loader" style="--archie-loader-size: 40px"></span>
                  <span class="clip-studio__frame-badge"><span class="clip-studio__frame-dot"></span>Analyzing</span>`
               : `<span class="clip-studio__frame-play"><i class="ap-icon-video"></i></span>`
           }
         </div>
         <div class="clip-studio__preview-foot">
           <span class="clip-studio__preview-name" title="${name}">${name} · ${uploadState === "ready" ? "Analyzed" : "Analyzing…"}</span>
           <button type="button" class="ap-button stroked grey" data-clip-studio-browse>
             <i class="ap-icon-upload" aria-hidden="true"></i><span>Replace file</span>
           </button>
         </div>
         <div class="clip-studio__or"><span>or paste a different link</span></div>
         <form class="clip-studio__url" data-clip-studio-url-form>
           <div class="ap-input-group">
             <i class="ap-icon-link" aria-hidden="true"></i>
             <input type="text" data-clip-studio-url placeholder="Paste a YouTube or Google Drive URL" aria-label="Replace with a video URL" />
           </div>
           <button type="submit" class="ap-button stroked grey">Import</button>
         </form>
       </div>`
    : `${dropzoneHTML({
        lead: "Drag & drop a video here",
        sub: "MP4, MOV or WEBM · up to 100MB",
        large: true,
        withInput: false,
        rootAttrs: "data-clip-studio-dropzone",
        ariaLabel: "Upload a video",
        action: { label: "Browse files", attrs: "data-clip-studio-browse" },
      })}
       <div class="clip-studio__or"><span>or</span></div>
       <form class="clip-studio__url" data-clip-studio-url-form>
         <div class="ap-input-group">
           <i class="ap-icon-link" aria-hidden="true"></i>
           <input type="text" data-clip-studio-url placeholder="Paste a YouTube or Google Drive URL" aria-label="Video URL" />
         </div>
         <button type="submit" class="ap-button stroked grey">Import</button>
       </form>`;

  return html`
    <aside class="session__assistant clip-studio clip-studio--upload" aria-label="Extract video clips">
      <div class="clip-studio__config">
        <header class="clip-studio__intro">
          <span class="clip-studio__ai-badge"
            ><i class="ap-icon-archie-official" aria-hidden="true"></i>Auto Clips</span
          >
          <h1 class="clip-studio__title">Turn a video into post-ready clips</h1>
          <p class="clip-studio__sub">
            Drop in a long video and I'll find the moments worth posting — cut to length and ready to draft in your
            playbook's voice. No editor required.
          </p>
        </header>

        ${raw(buildClipStudioFlow())}

        <input type="file" accept="video/*,.mp4,.mov,.webm" id="clipStudioFileInput" data-clip-studio-file hidden />

        <div class="clip-studio__setup">
          <section class="clip-studio__upload-area" aria-label="Add a video">${raw(leftPanel)}</section>

          <section class="clip-studio__settings" aria-label="Clip settings">
            <div class="clip-studio__field">
              <span class="clip-studio__field-label">Clip duration</span>
              <details class="ap-select clip-studio__select">
                <summary class="ap-select-trigger">
                  <span class="ap-select-value">${durLabelFor(curDuration)}</span>
                  <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
                </summary>
                <div class="ap-select-dropdown" role="listbox" aria-label="Clip duration">
                  <div class="ap-select-options">${raw(durationItems)}</div>
                </div>
              </details>
            </div>

            <div class="clip-studio__field">
              <div class="clip-studio__field-row">
                <label class="clip-studio__field-label" for="clipInstr">Additional instructions</label>
                <button type="button" class="ap-link standalone small" data-clip-surprise>
                  <i class="ap-icon-sparkles" aria-hidden="true"></i>Surprise me
                </button>
              </div>
              <div class="ap-textarea-field">
                <textarea
                  id="clipInstr"
                  rows="2"
                  data-clip-config="instructions"
                  placeholder="e.g. 'Don't include the intro' or 'Focus on the customer story.'"
                >
${escapeHtml(cfg.instructions || "")}</textarea
                >
              </div>
            </div>
          </section>
        </div>

        <div class="clip-studio__cta">
          ${raw(renderClipPlaybookControl(ctx))}
          <button
            type="button"
            class="ap-button primary orange clip-studio__generate"
            data-clip-create
            ${st.videoProvided ? "" : "disabled"}
          >
            <i class="ap-icon-archie-official" aria-hidden="true"></i><span>Find clip ideas</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderClipStudioAnalyzing(st) {
  // The loader animates purely in CSS over --extract-ms (kept in sync with
  // EXTRACT_TOTAL_MS in clip-studio.js) so there are NO per-tick re-renders —
  // the shimmer + progress bar stay perfectly smooth.
  return html`
    <aside class="session__assistant clip-studio clip-studio--analyzing" aria-label="Analyzing video">
      <div class="clip-studio__center" style="--extract-ms: 8s">
        <span class="clip-studio__ai-badge"><i class="ap-icon-archie-official" aria-hidden="true"></i>AI analysis</span>
        <h1 class="clip-studio__title">Finding the best clips…</h1>
        <div class="clip-studio__skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div class="source-card__progress clip-studio__progress" role="progressbar" aria-label="Cutting clips">
          <div class="source-card__progress-fill clip-studio__progress-fill clip-studio__progress-fill--anim"></div>
        </div>
        <p class="clip-studio__stage clip-studio__stage-cycle" aria-live="polite">
          <span>Transcribing audio</span><span>Finding highlights</span><span>Cutting clips</span><span>Polishing</span>
        </p>
        ${st.sourceName ? raw(`<p class="clip-studio__source muted">${escapeHtml(st.sourceName)}</p>`) : ""}
        <button type="button" class="ap-button ghost grey clip-studio__cancel" data-clip-back-config>Cancel</button>
      </div>
    </aside>
  `;
}

// Studio review card = the existing DS clip card (components/clip-card.js)
// wrapped with a selection checkbox. Its kebab Edit/Remove + thumb open the
// trimmer modal; the per-card footer is hidden in the studio (selection +
// Continue replaces per-clip drafting — see clip-studio.css).
function renderStudioClipCard(clip, st, sessionId) {
  const selected = (st.selectedClipIds || []).includes(clip.id);
  return `
    <div class="clip-studio-pick${selected ? " is-selected" : ""}">
      <label class="clip-studio-pick__check">
        <input type="checkbox" data-clip-select="${escapeHtml(clip.id)}" ${selected ? "checked" : ""} aria-label="Select clip" />
        <i aria-hidden="true"></i>
      </label>
      ${renderClipCard(clip, { sourceName: st.sourceName || "your video", sourceKind: "Video", sessionId })}
    </div>
  `;
}

function renderClipStudioClips(session, st) {
  const cfg = st.config || {};
  const clips = clipStudio.getClips(session.id);
  const cards = clips.map((c) => renderStudioClipCard(c, st, session.id)).join("");
  const selCount = (st.selectedClipIds || []).length;
  const formatCards = buildClipFormatCards(cfg);
  const captionCards = buildClipCaptionCards(cfg);
  return html`
    <aside class="session__assistant clip-studio clip-studio--clips" aria-label="Extracted clips">
      <div class="clip-studio__scroll">
        <div class="clip-studio__clips-head">
          <button type="button" class="ap-button ghost grey clip-studio__back" data-clip-back-config>
            <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back to setup</span>
          </button>
          <span class="clip-studio__ai-badge"
            ><i class="ap-icon-archie-official" aria-hidden="true"></i>Clips ready</span
          >
          <h1 class="clip-studio__title">${clips.length} clips from ${st.sourceName || "your video"}</h1>
          <p class="clip-studio__sub muted">
            Review and trim clips, pick the ones to keep, then set the format and captions.
          </p>
        </div>
        <div class="clip-studio__review-settings">
          <div class="clip-studio__field">
            <span class="clip-studio__field-label">Output format</span>
            <div class="clip-studio__fmtcards">${raw(formatCards)}</div>
          </div>
          <div class="clip-studio__field">
            <span class="clip-studio__field-label">Caption style</span>
            <div class="clip-studio__cap-grid">${raw(captionCards)}</div>
          </div>
        </div>
        <div class="clip-studio__grid">${raw(cards)}</div>
      </div>
      <div class="clip-studio__bar">
        <button type="button" class="ap-button stroked grey" data-clip-add-studio>
          <i class="ap-icon-plus" aria-hidden="true"></i><span>Add clip</span>
        </button>
        <div class="clip-studio__bar-right">
          <span class="clip-studio__bar-count">${selCount} selected</span>
          <button type="button" class="ap-button primary orange" data-clip-continue ${selCount ? "" : "disabled"}>
            <span>Continue</span><i class="ap-icon-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderClipStudioProfiles(session, st) {
  const profiles = getConnectedProfiles();
  const selectedProfiles = st.profileSelection || [];
  const selClips = (st.selectedClipIds || []).length;
  // Long profile lists get a live search box (same threshold as the in-chat
  // profile Quickpickers). The query lives in clip-studio state so it survives
  // the re-render a checkbox toggle triggers.
  const searchable = profiles.length > PROFILE_SEARCH_THRESHOLD;
  const q = (st.profileSearch || "").trim().toLowerCase();
  const rows = profiles
    .map((p) => {
      const on = selectedProfiles.includes(p.id);
      const haystack = [p.name, p.handle, p.platformLabel, p.kind].filter(Boolean).join(" ").toLowerCase();
      const hidden = searchable && q && !haystack.includes(q);
      const recId = defaultFormatFor(p.platform);
      // Default each profile to the output format chosen up-front; the network's
      // own recommended format is just marked "Recommended" (overridable).
      const chosen = st.perNetworkFormat?.[p.platform] || st.config?.format || recId;
      const fmts = formatsForNetwork(p.platform)
        .map((f) => {
          const fOn = f.id === chosen;
          const rec = f.id === recId;
          return `<button type="button" class="clip-studio__seg${fOn ? " is-on" : ""}" data-clip-netfmt="${escapeHtml(p.platform)}" data-value="${f.id}" aria-pressed="${fOn}">
            <span class="clip-studio__seg-ratio">${f.tag}</span>${rec ? `<span class="clip-studio__seg-rec">Recommended</span>` : ""}
          </button>`;
        })
        .join("");
      return `
        <div class="clip-studio__profile${on ? " is-on" : ""}${hidden ? " is-hidden" : ""}" data-search="${escapeHtml(haystack)}">
          <label class="clip-studio__profile-pick">
            <input type="checkbox" data-clip-profile="${escapeHtml(p.id)}" ${on ? "checked" : ""} aria-label="Select profile" />
            <i aria-hidden="true"></i>
            ${renderProfileTag(p)}
          </label>
          ${on ? `<div class="clip-studio__profile-fmt"><span class="clip-studio__seg-group" role="group" aria-label="Format for ${escapeHtml(p.platformLabel || p.platform)}">${fmts}</span></div>` : ""}
        </div>
      `;
    })
    .join("");
  const draftCount = selClips * selectedProfiles.length;
  return html`
    <aside class="session__assistant clip-studio clip-studio--profiles" aria-label="Choose profiles">
      <div class="clip-studio__scroll">
        <div class="clip-studio__clips-head">
          <button type="button" class="ap-button ghost grey clip-studio__back" data-clip-back>
            <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back to clips</span>
          </button>
          <h1 class="clip-studio__title">Where should I post these?</h1>
          <p class="clip-studio__sub muted">
            Pick the profiles to draft on. I've set the best video format per network — change any if you like.
          </p>
          ${searchable
            ? html`
                <div class="ap-input-group clip-studio__profile-search">
                  <i class="ap-icon-search" aria-hidden="true"></i>
                  <input
                    type="search"
                    data-clip-profile-search
                    placeholder="Search profiles by name, handle or network…"
                    value="${st.profileSearch || ""}"
                    aria-label="Search profiles"
                    autocomplete="off"
                  />
                </div>
              `
            : ""}
        </div>
        <div class="clip-studio__profiles">
          ${raw(rows)}
          <p class="clip-studio__profiles-empty muted" hidden>No profiles match your search.</p>
        </div>
      </div>
      <div class="clip-studio__bar">
        <button type="button" class="ap-button ghost grey" data-clip-back><span>Back</span></button>
        <div class="clip-studio__bar-right">
          <span class="clip-studio__bar-count">${selClips} clips · ${selectedProfiles.length} profiles</span>
          <button type="button" class="ap-button primary orange" data-clip-finalize ${draftCount ? "" : "disabled"}>
            <i class="ap-icon-archie-official" aria-hidden="true"></i
            ><span>Create ${draftCount} draft${draftCount === 1 ? "" : "s"}</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}

// Composer markup — extracted so it can be rendered either at the bottom
// of the assistant panel (default) or inline inside the empty hero (when
// the conversation hasn't started yet). The click handlers in bindSession
// are delegated on #app, so the same markup works in both positions
// without re-wiring.
// context.color → DS color token for the pill dot (blue maps to the
// electric-blue ramp, matching the [data-context-color] pill tints).
const CONTEXT_DOT_TOKEN = { blue: "electric-blue" };
function dotColorVar(colorName) {
  const token = CONTEXT_DOT_TOKEN[colorName] || colorName || "grey";
  return `var(--ref-color-${token}-100)`;
}

// Playbook control in the composer toolbar — matches the Figma form-select
// inline-label pattern (node 515:367): "Playbook" label + value + chevron,
// inside a .ap-select-trigger.
//   • selectable (New Chat / empty conversation) → a <details> wrapping the
//     .ap-select-trigger + .ap-select-dropdown. Picking a playbook routes
//     through the delegated [data-playbook-pick] handler in bindSession.
//   • static (active conversation) → a non-interactive .ap-select-trigger
//     in disabled state. No dropdown.
// Returns "" when there are no playbooks at all on a locked chat.
function renderPlaybookControl(ctx, selectable) {
  // Static indicator on active chats — only when a playbook is attached.
  if (!selectable) {
    if (!ctx) return "";
    return `
      <div class="composer-playbook" data-composer-playbook>
        <div
          class="ap-select-trigger disabled composer-playbook__trigger"
          data-context-color="${escapeHtml(ctx.color || "grey")}"
          title="Playbook: ${escapeHtml(ctx.name)}"
        >
          <span class="ap-select-inline-label">Playbook</span>
          <span class="ap-select-value">${escapeHtml(ctx.name)}</span>
        </div>
      </div>
    `;
  }

  // Selectable (New Chat) — always shown, even with no playbooks yet (then
  // the value placeholder reads "Select a playbook" and the dropdown offers
  // to create one).
  const playbooks = getContexts();
  const items = playbooks
    .map((c) => {
      const cColor = c.color || "grey";
      const isSel = ctx && c.id === ctx.id;
      return `
        <div
          class="ap-select-option${isSel ? " selected" : ""}"
          data-playbook-pick="${escapeHtml(c.id)}"
          role="option"
          aria-selected="${isSel ? "true" : "false"}"
        >
          <span class="composer-context__dot" style="background: ${dotColorVar(cColor)};"></span>
          <span class="ap-select-option-text">${escapeHtml(c.name)}</span>
          ${isSel ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>
      `;
    })
    .join("");
  const valueMarkup = ctx
    ? `<span class="ap-select-value">${escapeHtml(ctx.name)}</span>`
    : `<span class="ap-select-value ap-select-placeholder">Select a playbook</span>`;
  return `
    <details class="ap-select composer-playbook" data-composer-playbook>
      <summary class="ap-select-trigger composer-playbook__trigger" title="Choose the playbook for this chat">
        <span class="ap-select-inline-label">Playbook</span>
        ${valueMarkup}
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown composer-playbook__dropdown" role="listbox" aria-label="Choose a playbook">
        <div class="ap-select-options">${items}</div>
        <div class="ap-select-footer">
          <button type="button" class="ap-select-create" data-playbook-create>
            <i class="ap-icon-plus ap-select-create-icon" aria-hidden="true"></i>
            <span>Create a playbook</span>
          </button>
        </div>
      </div>
    </details>
  `;
}

// Composer "Add" menu — "Connected sources" is a nested submenu (Codex-style
// "Modules d'extension ▸" flyout), not a first-level list. The flyout lists the
// connected connectors as live sources you can query in chat (logo + name →
// ask), and the only place to connect new ones — "Browse connectors" — sits at
// the very bottom of that flyout.
// Returns a plain string and is interpolated WITHOUT raw(): renderComposer is a
// plain template literal, not html``, so a raw() wrapper stringifies to
// "[object Object]". Same call shape as renderConnectorsSubmenu right below it.
//
// The composer's way into Content Ideas. Same folder icon the sidebar's nav row
// uses, so the two read as one destination, and the same flag gates both — with
// contentResearch OFF this item disappears rather than opening an empty picker.
//
// It sits with "Top performing posts" below the divider: those two are the items
// that pick from something the app already holds, where everything above the
// divider brings something in from outside.
// Directly under "Pick from Content Ideas", because the two are the same gesture
// at two altitudes: a topic is one observation, a pillar is the standing theme
// several of them fed. Same flag gates both — a pillar only exists because a topic
// was filed into one, so with contentResearch off there is nothing to pick.
//
// The antenna, matching the sidebar's Content Ideas row rather than the folder
// this item's sibling still uses; the folder is the older icon and the nav row
// moved off it.
// ─── PARKED: Post about a Content Pillar ───────────────────────────────────
// This builder is intact and so is everything it reaches — the
// data-add-source="content-pillar" handler further down this file, openPillarPicker
// in research-modals.js, attachPillarToChat in pillar-flow.js. Only the CALL is
// commented out, in the composer's Add menu below; search PARKED there.
function renderContentPillarItem() {
  if (!isFlagOn("contentResearch")) return "";
  return html`<button type="button" class="ap-action-dropdown-item" data-add-source="content-pillar" role="menuitem">
    <i class="ap-icon-target"></i>
    <div class="ap-action-dropdown-item-text">
      <div class="ap-action-dropdown-item-label-container">
        <span class="ap-action-dropdown-item-label">Post about a Content Pillar</span>
      </div>
    </div>
  </button>`;
}

function renderContentIdeasItem() {
  if (!isFlagOn("contentResearch")) return "";
  return html`<button type="button" class="ap-action-dropdown-item" data-add-source="content-ideas" role="menuitem">
    <i class="ap-icon-folder"></i>
    <div class="ap-action-dropdown-item-text">
      <div class="ap-action-dropdown-item-label-container">
        <span class="ap-action-dropdown-item-label">Pick from Content Ideas</span>
      </div>
    </div>
  </button>`;
}

function renderConnectorsSubmenu() {
  // Connectors are gated behind a feature flag (default OFF) — when off, the
  // composer Add menu is just the file/URL quick-actions.
  if (!isFlagOn("connectors")) return "";
  const connected = getConnectedConnectors();
  const items = connected.length
    ? connected
        .map(
          (c) => `
          <button type="button" class="ap-action-dropdown-item assistant-attach__connector" data-attach-connector="${escapeHtml(
            c.id,
          )}" role="menuitem">
            <span class="assistant-attach__connector-logo">${renderConnectorLogo(c, 18)}</span>
            <div class="ap-action-dropdown-item-text">
              <div class="ap-action-dropdown-item-label-container">
                <span class="ap-action-dropdown-item-label">${escapeHtml(c.name)}</span>
              </div>
            </div>
          </button>`,
        )
        .join("")
    : `<div class="assistant-attach__menu-label">No sources connected yet</div>`;
  return `
    <div class="ap-action-dropdown-divider" role="separator"></div>
    <div class="assistant-attach__submenu-wrap">
      <button
        type="button"
        class="ap-action-dropdown-item assistant-attach__submenu-trigger"
        aria-haspopup="menu"
        role="menuitem"
      >
        <i class="ap-icon-stack"></i>
        <div class="ap-action-dropdown-item-text">
          <div class="ap-action-dropdown-item-label-container">
            <span class="ap-action-dropdown-item-label">Connected sources</span>
          </div>
        </div>
        <i class="ap-icon-chevron-right" aria-hidden="true"></i>
      </button>
      <div class="ap-action-dropdown assistant-attach__submenu" role="menu">
        ${items}
        <div class="ap-action-dropdown-divider" role="separator"></div>
        <button type="button" class="ap-action-dropdown-item" data-open-connectors role="menuitem">
          <i class="ap-icon-view-grid"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Browse connectors</span>
            </div>
          </div>
        </button>
      </div>
    </div>`;
}

// The Add menu opens DOWNWARD by default (see styles/screens/session.css), and
// flips up only when there genuinely isn't room below. Neither direction works
// on its own, because the composer sits in two very different places:
//
//   • an active chat  — composer pinned near the viewport bottom, ~50px below it
//     and the whole page above, so the menu has to grow up;
//   • a new/empty chat — composer around mid-page, so growing up clips its top.
//
// At eight items plus a divider and the "Connected sources" flyout the menu is
// now ~313px tall, which is more than either gap can be assumed to hold. So
// measure once on open and pick the side that fits, preferring down. The nested
// flyout needs no equivalent: it grows up from the LAST row, so it stays inside
// the span this function already confirmed fits.
function placeAttachMenu(trigger, menu) {
  menu.classList.remove("is-up");
  const t = trigger.getBoundingClientRect();
  const h = menu.getBoundingClientRect().height;
  const gap = 8; // --ref-spacing-xxs, matching the CSS offset
  const roomBelow = window.innerHeight - t.bottom - gap;
  // Flip up only when down doesn't fit AND up does — if neither fits, down is
  // the friendlier failure: the menu is scrolled into reach, not cut off above
  // the window where there is nothing to scroll to.
  if (h > roomBelow && h <= t.top - gap) menu.classList.add("is-up");
}

// "Ready" status bars (DS .ap-status-card) glued to the top of the composer,
// shown in addition to the transient snackbar when a batch lands. Keyed per-
// session in module scope so they survive aside re-renders and screen re-mounts;
// each is cleared when its panel opens (lifecycle: "until reviewed"). When both
// are pending the most recent (by `at`) wins the single slot.
//   draftBanners: sessionId → { batchId, count, at }  — cleared on Drafts panel
//   ideaBanners:  sessionId → { count, at }            — cleared on Ideas panel
const draftBanners = new Map();
const ideaBanners = new Map();

function draftBannerFlowInner(count) {
  return `<span>${count} draft${count === 1 ? "" : "s"} ready</span> to review`;
}

function ideaBannerFlowInner(count) {
  return `<span>${count} idea${count === 1 ? "" : "s"} ready</span>`;
}

function withEllipsis(s) {
  return /…$/.test(s) ? s : `${s}…`;
}

// In-progress label for a loading thread message (adapted from the rule in
// conversation-status-card.js; duplicated to keep the version cascade small).
// Returns null for messages that aren't a distinct user-facing task. source-
// intake is handled by the sources signal in computeComposerStatus (skipped
// there) to avoid a double-count.
function humanizeLoadingMessage(m) {
  // The hidden assistant answer placeholder is the same operation as its
  // reasoning pill — count the pill, not the empty answer slot, so a single
  // reply reads "Thinking…" rather than "2 tasks running…".
  if (m.hidden) return null;
  if (m.role === "idea-extraction") return `Extracting ideas from ${m.filename || "source"}…`;
  if (m.role === "clip-extraction") return `Extracting clips from ${m.filename || "source"}…`;
  if (m.role === "assistant") return withEllipsis(m.meta && m.meta !== "Archie" ? m.meta : "Thinking");
  if (m.role === "system" || m.role === "system-notice") {
    return withEllipsis(m.meta && m.meta !== "System" ? m.meta : m.text || "Working");
  }
  // Generic busy marker (startPending) — drafts/ideas flows pass a meta label
  // ("Extracting ideas", "Generating drafts"); fall back to "Working".
  if (m.role === "pending") return withEllipsis(m.meta || "Working");
  return "Working…";
}

// One unified descriptor for the composer status slot. `shape` drives the
// reconcile (same shape → in-place text update; different → markup swap):
//   { shape:"grey",   variant:"grey",  label, key }  — background work running
//   { shape:"drafts", variant:"green", count, key }  — drafts ready
//   { shape:"ideas",  variant:"green", count, key }  — ideas ready
//   null                                             — idle
// Grey (in-progress) wins over the green "ready" bars; among the two ready bars
// the most recent (by `at`) wins the single slot, then yields to the other when
// its panel is opened.
function computeComposerStatus(sessionId) {
  const labels = [];
  // Sources analysing — the canonical background action and the source of
  // truth (the matching source-intake thread turns are skipped below).
  for (const s of getSources(sessionId)) {
    if (s.status === "Processing") labels.push(`Analyzing ${s.filename || "source"}…`);
  }
  // Video clip extraction (when a normal composer is present).
  const clip = clipStudio.getState(sessionId);
  if (clip && clip.stage === "analyzing") {
    labels.push(clip._stageLabel ? `${clip._stageLabel}…` : "Analyzing video…");
  }
  // Other loading thread turns: idea/clip extraction, draft generation, replies.
  for (const m of getThread(sessionId)) {
    if (m.status !== "loading") continue;
    if (m.role === "source-intake") continue; // counted via getSources above
    const label = humanizeLoadingMessage(m);
    if (label) labels.push(label);
  }
  if (labels.length > 0) {
    const label = labels.length === 1 ? labels[0] : `${labels.length} tasks running…`;
    return { shape: "grey", variant: "grey", labels, label, key: `grey|${label}` };
  }
  const draft = draftBanners.get(sessionId);
  const idea = ideaBanners.get(sessionId);
  const draftDesc = draft && { shape: "drafts", variant: "green", count: draft.count, key: `drafts|${draft.count}` };
  const ideaDesc = idea && { shape: "ideas", variant: "green", count: idea.count, key: `ideas|${idea.count}` };
  if (draft && idea) return idea.at > draft.at ? ideaDesc : draftDesc;
  return draftDesc || ideaDesc || null;
}

function renderComposerStatus(sessionId) {
  const status = computeComposerStatus(sessionId);
  if (!status) return "";
  if (status.shape === "drafts") {
    return html`
      <div
        class="ap-status-card green session__composer-status"
        data-status-key="${status.key}"
        data-status-shape="drafts"
        role="status"
      >
        <div class="upper">
          <i class="ap-icon-file" aria-hidden="true"></i>
          <div class="flow">${raw(draftBannerFlowInner(status.count))}</div>
          <button type="button" class="ap-link small standalone" data-draft-banner-review>Review</button>
        </div>
      </div>
    `;
  }
  if (status.shape === "ideas") {
    return html`
      <div
        class="ap-status-card green session__composer-status"
        data-status-key="${status.key}"
        data-status-shape="ideas"
        role="status"
      >
        <div class="upper">
          <i class="ap-icon-archie-official" aria-hidden="true"></i>
          <div class="flow">${raw(ideaBannerFlowInner(status.count))}</div>
          <button type="button" class="ap-link small standalone" data-idea-banner-view>View ideas</button>
        </div>
      </div>
    `;
  }
  // Grey in-progress. The .ap-loader's branded SVG is auto-injected by
  // archie-loader.js's observer on insert; ds-patches.css recolours it grey for
  // this bar (the default would be orange).
  return html`
    <div
      class="ap-status-card grey session__composer-status"
      data-status-key="${status.key}"
      data-status-shape="grey"
      role="status"
      aria-live="polite"
    >
      <div class="upper">
        <span class="ap-loader grey size-16" aria-hidden="true"
          ><svg>
            <circle></circle>
            <circle></circle></svg
        ></span>
        <div class="flow" data-status-label>${status.label}</div>
      </div>
    </div>
  `;
}

// Enter animation for a freshly-inserted banner: collapse-reveal synced to the
// element's real height (--status-h kills the max-height "dead time"), plus fade
// + a short rise. Measured + class added in the same tick (before paint) so
// there's no full-height flash. The reduced-motion guard in base.css collapses
// it to instant. The class is self-removing so a later full-aside rebuild (which
// re-renders the banner statically) doesn't replay the entrance.
function animateBannerIn(el) {
  if (!el) return;
  el.style.setProperty("--status-h", `${el.offsetHeight}px`);
  el.classList.add("is-entering");
  const clear = () => el.classList.remove("is-entering");
  el.addEventListener("animationend", clear, { once: true });
  setTimeout(clear, 500);
}

// Exit animation: reverse the reveal (faster, accelerating), THEN remove the
// node and run `done`. Callers that open the Drafts panel pass the open as
// `done` so the panel opens only after the banner has left — opening writes the
// URL hash, which can re-render the route and would otherwise cut the animation.
function animateBannerOut(el, done) {
  if (!el) {
    if (done) done();
    return;
  }
  if (el.classList.contains("is-leaving")) return;
  el.style.setProperty("--status-h", `${el.offsetHeight}px`);
  el.classList.remove("is-entering");
  void el.offsetHeight; // reflow so an interrupted enter restarts cleanly
  el.classList.add("is-leaving");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    el.remove();
    if (done) done();
  };
  el.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 500);
}

function renderComposer(attachedContext, session, selectable) {
  // Nothing to @mention until the session has at least one ready source or
  // extracted idea — disable the trigger so it doesn't open an empty picker.
  const hasMentionable =
    getSources(session.id).some((s) => s.status !== "Processing") || getIdeas(session.id).length > 0;
  return `
    <div class="session__composer">
      <div class="session__composer-inner">
        ${renderComposerStatus(session.id)}
        <div class="session__composer-card">
          <div
            class="composer-mention-picker"
            id="composerMentionPicker"
            data-composer-mention-picker
            role="listbox"
            aria-label="Reference a source or idea"
            hidden
          ></div>
          <div
            class="session__composer-mentions"
            data-composer-mentions
            hidden
          ></div>
          <div class="session__composer-input-row">
            <div
              class="session__composer-connector"
              data-composer-connector
              hidden
            ></div>
            <textarea
              class="session__composer-input-field"
              id="assistantInput"
              aria-label="Message Archie"
              placeholder="${COMPOSER_DEFAULT_PLACEHOLDER}"
              rows="2"
            ></textarea>
          </div>
          <div class="session__composer-toolbar">
            <div class="assistant-attach">
              <button
                type="button"
                class="ap-button stroked grey assistant-attach__trigger"
                aria-label="Add a source"
                data-assistant-attach-toggle
              >
                <i class="ap-icon-plus"></i>
                <span>Add</span>
              </button>
              <div class="ap-action-dropdown assistant-attach__menu" data-assistant-attach-menu hidden role="menu">
                <button type="button" class="ap-action-dropdown-item" data-add-source="pdf" role="menuitem">
                  <i class="ap-icon-file--pdf"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Add PDF</span>
                    </div>
                  </div>
                </button>
                <button type="button" class="ap-action-dropdown-item" data-add-source="video" role="menuitem">
                  <i class="ap-icon-file--video"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Add video</span>
                    </div>
                  </div>
                </button>
                <button type="button" class="ap-action-dropdown-item" data-add-source="url" role="menuitem">
                  <i class="ap-icon-link"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Add URL</span>
                    </div>
                  </div>
                </button>
                <button type="button" class="ap-action-dropdown-item" data-add-source="text" role="menuitem">
                  <i class="ap-icon-file--text"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Paste text</span>
                    </div>
                  </div>
                </button>
                <div class="ap-action-dropdown-divider" aria-hidden="true"></div>
                <button type="button" class="ap-action-dropdown-item" data-add-source="top-posts" role="menuitem">
                  <i class="ap-icon-feature-analytics"></i>
                  <div class="ap-action-dropdown-item-text">
                    <div class="ap-action-dropdown-item-label-container">
                      <span class="ap-action-dropdown-item-label">Top performing posts</span>
                    </div>
                  </div>
                </button>
                <!-- PARKED: renderContentPillarItem() used to sit right after
                     renderContentIdeasItem() here — "Post about a Content Pillar".
                     Add the call back to restore it; the builder is still above. -->
                ${renderContentIdeasItem()}
                ${renderConnectorsSubmenu()}
              </div>
            </div>
            <button
              type="button"
              class="ap-button stroked grey composer-mention-trigger"
              aria-label="Reference a source or idea"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-controls="composerMentionPicker"
              data-composer-mention-trigger
              ${hasMentionable ? "" : 'disabled title="Add a source or extract an idea first"'}
            >
              <i class="ap-icon-at"></i>
              <span>Reference</span>
            </button>
            ${renderPlaybookControl(attachedContext, selectable)}
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
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for new line · Drop a file to attach a source
        </div>
      </div>
    </div>
  `;
}

// ── Composer connector chip ───────────────────────────────────────────
// When a connected connector is "asked", it's attached to the composer as a
// chip (logo + name + ×). The next message is routed to the connector (live
// MCP) by submitInput(). Rendering the chip also swaps the textarea placeholder
// to "Ask {name} anything…" and (on attach) focuses the input.
function renderComposerConnector(root, sessionId, { focus = false } = {}) {
  const container = root.querySelector("[data-composer-connector]");
  if (!container) return;
  const input = root.querySelector("#assistantInput");
  const id = getActiveConnector(sessionId);
  const connector = id ? findConnector(id) : null;
  if (!connector) {
    container.innerHTML = "";
    container.hidden = true;
    if (input) input.placeholder = COMPOSER_DEFAULT_PLACEHOLDER;
    return;
  }
  container.hidden = false;
  // Same chip family as the @ mention pills: a DS .ap-tag with the
  // connector logo as a 16px .ap-tag-avatar + an auto-styled close button.
  container.innerHTML = `
    <span class="ap-tag grey composer-mention composer-connector-chip">
      <span class="ap-tag-avatar">${renderConnectorLogo(connector, 16)}</span>
      <span class="composer-mention__label">${escapeHtmlAttr(connector.name)}</span>
      <button
        type="button"
        class="composer-mention__remove"
        data-composer-connector-remove
        aria-label="Remove ${escapeHtmlAttr(connector.name)}"
        title="Remove connector"
      >
        <i class="ap-icon-close"></i>
      </button>
    </span>`;
  if (input) {
    input.placeholder = `Ask ${connector.name} anything…`;
    if (focus) input.focus();
  }
}

// ── Composer mention picker ───────────────────────────────────────────
// Popup that floats above the composer card listing the session's
// sources + ideas. Picking one delegates to addComposerMention(name);
// the existing composer-mentions subscriber repaints the pill row.
//
// Triggered by:
//   • Click on the composer "@ Mention" toolbar button
//   • Typing "@" in the textarea
//
// Closed by:
//   • Picking an item
//   • Clicking outside the picker / trigger
//   • Pressing Escape

// Module-local index of the currently-highlighted row in the @mention
// picker — mirrors the search-modal pattern (search-modal.js). Arrow
// keys increment/decrement, Enter selects, mousemove syncs to row
// under the cursor. Reset to 0 every time the picker opens.
let mentionHighlightIndex = 0;

// The picker popup is shared between two modes:
//   • "mention" → "@" lists the session's sources + ideas (context pills).
//   • "command" → "/" lists CONNECTED connectors to ask via MCP.
// Keyboard nav / highlight / positioning are mode-agnostic (they operate
// on [data-mention-row-index] rows), so only the rendered body differs.
let pickerMode = "mention";

function renderMentionPickerInto(container, sessionId, mode = "mention") {
  if (!container) return;
  let cursor = 0;

  // "/" command mode — connectors render as a classic DS action-dropdown
  // (label + description + brand logo). Only connected connectors are
  // live/queryable.
  if (mode === "command") {
    // Compact single-line items (logo + name) — a classic DS dropdown.
    const renderItem = (iconHtml, name, dataAttr) => {
      const index = cursor++;
      return `
    <button
      type="button"
      class="ap-action-dropdown-item"
      role="option"
      tabindex="0"
      aria-selected="false"
      data-mention-row-index="${index}"
      ${dataAttr}
    >
      ${iconHtml}
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${escapeHtmlAttr(name)}</span>
        </div>
      </div>
    </button>
  `;
    };
    const connectors = getConnectedConnectors();
    container.innerHTML =
      connectors.length > 0
        ? `<div class="ap-action-dropdown" role="group">
            ${connectors
              .map((c) =>
                renderItem(renderConnectorLogo(c, 16), c.name, `data-mention-pick-connector="${escapeHtmlAttr(c.id)}"`),
              )
              .join("")}
          </div>`
        : `<div class="composer-mention-picker__empty muted">No connected connectors yet.</div>`;
    return;
  }

  // "@" mention mode — original custom picker (sources + ideas).
  const renderRow = (icon, name, kindLabel, dataAttr) => {
    const index = cursor++;
    return `
    <li
      class="composer-mention-picker__row"
      role="option"
      tabindex="0"
      data-mention-row-index="${index}"
      ${dataAttr}
    >
      <span class="composer-mention-picker__row-icon" aria-hidden="true">
        <i class="${icon}"></i>
      </span>
      <span class="composer-mention-picker__row-name">${escapeHtmlAttr(name)}</span>
      ${kindLabel ? `<span class="composer-mention-picker__row-kind muted">${escapeHtmlAttr(kindLabel)}</span>` : ""}
    </li>
  `;
  };
  const sources = getSources(sessionId).filter((s) => s.status !== "Processing");
  const ideas = getIdeas(sessionId);
  const sourcesSection =
    sources.length > 0
      ? `
        <div class="composer-mention-picker__section">
          <div class="composer-mention-picker__header">Reference a source</div>
          <ul class="composer-mention-picker__list" role="group">
            ${sources
              .map((s) =>
                renderRow(
                  "ap-icon-archie-official",
                  s.filename,
                  s.kind || "",
                  `data-mention-pick-source="${escapeHtmlAttr(s.id)}"`,
                ),
              )
              .join("")}
          </ul>
        </div>
      `
      : "";
  const ideasSection =
    ideas.length > 0
      ? `
        <div class="composer-mention-picker__section">
          <div class="composer-mention-picker__header">Reference an idea</div>
          <ul class="composer-mention-picker__list" role="group">
            ${ideas
              .map((i) =>
                renderRow(
                  "ap-icon-archie-official",
                  i.title,
                  i.kind || "",
                  `data-mention-pick-idea="${escapeHtmlAttr(i.id)}"`,
                ),
              )
              .join("")}
          </ul>
        </div>
      `
      : "";
  container.innerHTML =
    sourcesSection || ideasSection
      ? sourcesSection + ideasSection
      : `<div class="composer-mention-picker__empty muted">No sources or ideas yet.</div>`;
}

function openMentionPicker(root, sessionId, mode = "mention") {
  const picker = root.querySelector("[data-composer-mention-picker]");
  const trigger = root.querySelector("[data-composer-mention-trigger]");
  if (!picker) return;
  pickerMode = mode;
  // Command mode swaps the custom picker chrome for the DS dropdown's own
  // surface — the modifier strips this wrapper's box so they don't double up.
  picker.classList.toggle("composer-mention-picker--command", mode === "command");
  renderMentionPickerInto(picker, sessionId, mode);
  picker.hidden = false;
  mentionHighlightIndex = 0;
  syncMentionHighlight(picker);
  if (trigger) trigger.setAttribute("aria-expanded", "true");
}

function closeMentionPicker(root) {
  const picker = root.querySelector("[data-composer-mention-picker]");
  const trigger = root.querySelector("[data-composer-mention-trigger]");
  if (picker) {
    picker.hidden = true;
    picker.innerHTML = "";
  }
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

function toggleMentionPicker(root, sessionId) {
  const picker = root.querySelector("[data-composer-mention-picker]");
  if (!picker) return;
  if (picker.hidden) openMentionPicker(root, sessionId);
  else closeMentionPicker(root);
}

// Toggle .is-highlighted + aria-selected on the row at the current
// index. Scroll it into view so keyboard nav stays on screen.
function syncMentionHighlight(picker) {
  const rows = picker.querySelectorAll("[data-mention-row-index]");
  if (!rows.length) return;
  if (mentionHighlightIndex < 0) mentionHighlightIndex = rows.length - 1;
  else if (mentionHighlightIndex >= rows.length) mentionHighlightIndex = 0;
  rows.forEach((row) => {
    const idx = Number(row.dataset.mentionRowIndex);
    const active = idx === mentionHighlightIndex;
    // Mention rows use the custom .is-highlighted; the "/" command DS
    // dropdown uses the DS .focused state. Toggle both — each surface
    // only styles its own class, so the other is a harmless no-op.
    row.classList.toggle("is-highlighted", active);
    row.classList.toggle("focused", active);
    row.setAttribute("aria-selected", active ? "true" : "false");
    if (active) row.scrollIntoView({ block: "nearest" });
  });
}

// Click the row at the current highlight — selects + closes the
// picker via the existing pickSource / pickIdea click delegates.
function activateHighlightedMention(picker) {
  const rows = picker.querySelectorAll("[data-mention-row-index]");
  const row = rows[mentionHighlightIndex];
  if (row) row.click();
}

// Strip the "/" command trigger token from the textarea before attaching
// a connector, so the leftover "/" (and anything typed after it) doesn't
// pollute the message routed to the connector. Removes the "/" + the run
// of non-whitespace chars immediately preceding the caret.
function removeSlashToken(input) {
  if (!input) return;
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const stripped = before.replace(/\/\S*$/, "");
  if (stripped === before) return;
  const after = input.value.slice(caret);
  input.value = stripped + after;
  const pos = stripped.length;
  input.setSelectionRange(pos, pos);
}

// (The context pill that used to live here moved to the app header next
// to the chat title — see components/topbar.js → renderContextPill.)

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
// ── The Content Ideas card on the new-session page ──────────────────────────
//
// One topic at a time, from the same briefs the /content-ideas feed shows. It sits
// ABOVE the workflow grid rather than inside it: the grid is three fixed
// workflows and this is a live suggestion with its own lifecycle — it flips, it
// runs out, it turns into an empty state. Dropping it into the grid would make
// the grid reflow from four cells to three the moment the queue emptied.
//
// The queue is rendered one card at a time and advanced by the flip button.
// `starterTopicIndex` is module-level for the same reason the picker's step is:
// the hero re-renders through renderEmptyHero and the position has to outlive
// that.
let starterTopicIndex = 0;
let starterTopicSession = null;

// Reset the queue when the hero paints for a DIFFERENT chat. Carrying the
// position across chats would mean that once you had flipped through four
// topics, every new chat you ever opened greeted you with the empty state —
// the queue is "what's worth drafting right now", not a read receipt.
// The wait before the first topic appears. Purely theatrical — nothing is
// actually being fetched — but it is the one moment the prototype can show that
// topics ARRIVE rather than sit there waiting to be found, which is the whole
// premise of Content Ideas. Three seconds is long enough to read the line and
// short enough that nobody sits through it twice.
const STARTER_TOPIC_COUNTDOWN = 3;
let starterTopicCountdown = STARTER_TOPIC_COUNTDOWN;
let starterTopicTimer = null;

function syncStarterTopicSession(sessionId) {
  if (starterTopicSession === sessionId) return;
  starterTopicSession = sessionId;
  starterTopicIndex = 0;
  starterTopicCountdown = STARTER_TOPIC_COUNTDOWN;
}

// One delay, not a per-second tick. Nothing counts down on screen any more — the
// spinner says "working" without committing to a number, which is also the
// honest signal: a real scan doesn't know when it will finish, and a ticking
// "3s" promised precision the feature can't have.
//
// It checks the slot is still mounted before swapping, so navigating away or
// sending the first message can't leave a timer painting into a detached tree.
// That self-check is the cleanup, deliberately: the hero re-renders from several
// places and a teardown hook in only some of them would leak from the others.
function startStarterTopicCountdown() {
  if (starterTopicTimer) clearTimeout(starterTopicTimer);
  starterTopicTimer = window.setTimeout(() => {
    starterTopicTimer = null;
    starterTopicCountdown = 0;
    const slot = document.querySelector("[data-starter-topic-slot]");
    if (!slot || !document.body.contains(slot)) return;
    const host = slot.parentElement;
    const next = document.createElement("div");
    next.innerHTML = renderStarterTopicSlot();
    const fresh = next.querySelector("[data-starter-topic-slot]");
    if (!fresh) return;
    host.replaceChild(fresh, slot);
    const stage = fresh.querySelector("[data-starter-topic-stage]");
    if (stage && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stage.classList.add("is-entering");
    }
  }, STARTER_TOPIC_COUNTDOWN * 1000);
}

// A brief's accent, keyed off the same two booleans the topic card reads. New
// gets nothing — an accent on every card would say nothing about any of them.
function starterTopicTone(brief) {
  if (brief.isTrending) return "trending";
  if (brief.isUpdated) return "updated";
  return "plain";
}

function renderStarterTopicCard(brief) {
  const lane = getLaneById(brief.laneId);
  const pb = lane ? getContextById(lane.playbookId) : null;
  const src = findResearchSource(brief.sourceId);
  const tone = starterTopicTone(brief);
  // NB: this function builds a PLAIN template literal, not an html`` one, so
  // every fragment below is interpolated as raw HTML — never wrap one in raw(),
  // which only means something inside html`` and stringifies to "[object
  // Object]" here.
  // Playbook › topic list, wrapped in ONE element so the three parts share a
  // tight gap of their own. It is now the ONLY thing on the head row — the
  // signal mark moved down to the end of the title — so the crumb gets the whole
  // width and the topic list ellipsises inside it rather than the crumb being
  // clipped as a block.
  const crumb = `<span class="starter-topic__crumb">${
    pb
      ? `<span class="starter-topic__pb">${escapeHtml(pb.name)}</span><span class="starter-topic__sep" aria-hidden="true">›</span>`
      : ""
  }<span class="starter-topic__lane">${escapeHtml(lane ? lane.name : "Content Ideas")}</span></span>`;
  // The marks are the feed's own components (trending-mark.css), not a second
  // drawing of the same idea — the accent says "something is up with this one"
  // and the mark says which.
  const mark =
    tone === "trending"
      ? `<span class="trending-mark"><i class="ap-icon-arrow-up" aria-hidden="true"></i><span>Trending</span></span>`
      : tone === "updated"
        ? `<span class="updated-mark"><i class="ap-icon-refresh" aria-hidden="true"></i><span>Updated</span></span>`
        : "";
  return `
    <button
      type="button"
      class="starter-card starter-card--topic starter-topic--${tone}"
      data-starter-topic="${escapeHtml(brief.id)}"
    >
      <i class="starter-card__art ${escapeHtml(src?.icon || "ap-icon-note")}" aria-hidden="true"></i>
      <span class="starter-topic__head">
        <!-- Playbook › topic list. Both, because the card can surface a topic
             from any Playbook the account owns — the topic list alone doesn't
             say whose brand it belongs to, and on this screen you haven't picked
             one yet. The chevron reads as a path rather than two peer labels. -->
        ${crumb}
      </span>
      <!-- The signal mark rides at the END OF THE TITLE, inline, so it reads as
           part of the sentence it qualifies rather than as a second label
           competing with the crumb above. Inline-flex, so it flows with the text
           and lands after the last word wherever that falls. -->
      <span class="starter-card__title"
        >${escapeHtml(brief.headline)}${mark ? ` ${mark}` : ""}</span
      >
      <span class="starter-card__cta ap-link standalone small"
        >Start drafting<i class="ap-icon-arrow-right" aria-hidden="true"></i
      ></span>
    </button>
  `;
}

// The waiting card, shown once per chat before the first topic. Same shape as the
// empty state — a plain div, no flip control, nothing to click — because both are
// the slot saying "not yet" rather than offering something.
//
// Message first, then the spinner filling everything under it. The order matters:
// the card is read once and then watched, so the sentence should be where the eye
// already lands — the top-left, level with every other card's title — and the
// animation should own the space you go on looking at.
//
// "Finalizing your first custom post ideas" — present participle, so it reads as
// work in progress rather than a promise about timing, which is the same reason
// the countdown became a spinner.
//
// The DS .ap-loader is deliberate rather than a custom ring: archie-loader.js
// watches the DOM for that class and swaps in the animated Archie mark, so this
// matches every other spinner in the app for free — including the ones that
// appear after this card is injected, because it watches via MutationObserver.
// .ap-loader-container is the DS's own centring wrapper; the fill comes from a
// flex rule on it, so the loader itself keeps a documented size class.
//
// No watermark glyph here. The spinner already says "working"; an hourglass
// behind it would be the same sentence twice.
function renderStarterTopicWaiting() {
  return `
    <div class="starter-card starter-card--topic starter-topic--waiting">
      <span class="starter-card__title">Finalizing your first custom post ideas</span>
      <!-- .starter-card__subtitle, the same sub-header the workflow cards and the
           empty state use — the waiting card was the only one of the three
           without one. It sits between the message and the spinner so the three
           read top to bottom as what's happening, what to do, and that it's
           still going. -->
      <span class="starter-card__subtitle">Hold on tight</span>
      <span class="ap-loader-container starter-topic__spinner" aria-hidden="true">
        <span class="ap-loader orange size-48"></span>
      </span>
    </div>
  `;
}

// Reached only by flipping past the last topic — never on first paint, where a
// user with no topics gets no slot at all rather than an empty one. The CTA is
// the same .starter-card__cta as a live card so the two read as one component;
// it is an <a> because it navigates, and the card around it is a plain div
// because there is nothing else here to click.
function renderStarterTopicEmpty() {
  return `
    <div class="starter-card starter-card--topic starter-topic--empty">
      <i class="starter-card__art ap-icon-note" aria-hidden="true"></i>
      <span class="starter-card__title">That's everything for now</span>
      <span class="starter-card__subtitle">Come back later for more content ideas. Refreshes weekly.</span>
      <a class="starter-card__cta ap-link standalone small" href="#/content-ideas"
        >Explore more topics<i class="ap-icon-arrow-right" aria-hidden="true"></i
      ></a>
    </div>
  `;
}

// The whole block: label + slot. The flip button is a SIBLING of the card, not
// a child — .starter-card is a <button>, and a button inside a button is
// invalid HTML that browsers resolve unpredictably. The wrapper is the
// positioning context for both.
function renderStarterTopicSlot(sessionId) {
  if (!isFlagOn("contentResearch")) return "";
  if (sessionId) syncStarterTopicSession(sessionId);
  const queue = getStarterTopics();
  // No topics at all (new-alt mode): no slot, not an empty state. "Come back
  // later" is an answer to "I've read them all", not to "there was never
  // anything here".
  if (!queue.length) return "";
  const waiting = starterTopicCountdown > 0;
  const brief = waiting ? null : queue[starterTopicIndex] || null;
  const remaining = queue.length - starterTopicIndex - 1;
  if (waiting) startStarterTopicCountdown();
  return `
    <div class="starter-topic" data-starter-topic-slot>
      <div class="starter-topic__stage" data-starter-topic-stage>
        ${waiting ? renderStarterTopicWaiting() : brief ? renderStarterTopicCard(brief) : renderStarterTopicEmpty()}
      </div>
      ${
        brief
          ? `<button
              type="button"
              class="ap-icon-button ghost grey starter-topic__flip"
              data-starter-topic-flip
              aria-label="Cycle through more ideas${remaining > 0 ? ` (${remaining} more)` : ""}"
            >
              <i class="ap-icon-shuffle" aria-hidden="true"></i>
            </button>
            <!-- The DS Tooltip, not the native title attribute. title waits about
                 a second, can't be styled, and renders in the OS chrome rather
                 than the page — three reasons the DS ships a component for this.
                 It sits AFTER the button so a plain adjacent-sibling selector can
                 reveal it, and inside .starter-topic (position: relative) rather
                 than the card, whose overflow:hidden would clip it.
                 aria-hidden: the button's own label already carries this, and a
                 display:none target can't be read through aria-describedby. -->
            <span class="ap-tooltip top-right starter-topic__tip" aria-hidden="true"
              >Click to cycle through more ideas</span
            >`
          : ""
      }
    </div>
  `;
}

// Both halves of "a topic opens its own chat" now live in brief-flow.js, because
// four surfaces start that flow and three of them can't import this file. See
// the header there.
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
  const starters = [...chatStarters];
  const cards = starters
    .map((s) => {
      // `comingSoon` cards are teasers — rendered as a non-interactive panel
      // carrying a "Coming soon" badge instead of a clickable CTA arrow.
      if (s.comingSoon) {
        const tone = s.tone || "orange";
        return `
          <div class="starter-card starter-card--${tone} starter-card--soon" data-starter="${s.id}" aria-disabled="true">
            <i class="starter-card__art ${s.icon}" aria-hidden="true"></i>
            <span class="starter-card__title">${s.title}</span>
            <span class="starter-card__subtitle">${s.subtitle}</span>
            <span class="starter-card__cta--soon ap-badge blue">${s.cta}</span>
          </div>
        `;
      }
      const resolvedPrompt = (s.prompt || "")
        .replace(/\{\{source\}\}/g, sourceLabel)
        .replace(/\{\{video-source\}\}/g, videoLabel);
      const actionAttr = s.action ? ` data-starter-action="${s.action}"` : "";
      const tone = s.tone || "orange";
      return `
        <button type="button" class="starter-card starter-card--${tone}" data-starter="${s.id}"${actionAttr} data-starter-prompt="${escapeHtml(resolvedPrompt)}">
          <i class="starter-card__art ${s.icon}" aria-hidden="true"></i>
          <span class="starter-card__title">${s.title}</span>
          <span class="starter-card__subtitle">${s.subtitle}</span>
          <span class="starter-card__cta ap-link standalone small">${s.cta}<i class="ap-icon-arrow-right" aria-hidden="true"></i></span>
        </button>
      `;
    })
    .join("");
  return html`
    <div class="empty-chat" data-empty-chat>
      <span class="empty-chat__logo" role="img" aria-label="Archie">
        <img class="empty-chat__logo-word empty-chat__logo-word--a" src="assets/logos/archie-wordmark.svg" alt="" />
        <img class="empty-chat__logo-mono" src="assets/logos/archie-mono.svg" alt="" />
        <img class="empty-chat__logo-word empty-chat__logo-word--b" src="assets/logos/archie-alt-wordmark.svg" alt="" />
      </span>
      <div class="empty-chat__sub">
        Drop a source — I'll turn it into a batch of ready-to-schedule posts, all from one chat.
      </div>
      ${raw(composerMarkup)}
      <h2 class="empty-chat__starter-label" id="starterGridLabel">Or jump into a workflow</h2>
      <!-- The Content Ideas card is the grid's FIRST cell, two columns wide —
           see renderStarterTopicSlot. It sits under the same label as the
           workflow cards because it answers the same question ("what now?"),
           and inside the grid rather than above it so the two share one
           alignment instead of stacking two full-width blocks. -->
      <div class="starter-grid" role="group" aria-labelledby="starterGridLabel">
        ${raw(renderStarterTopicSlot(sessionId))}${raw(cards)}
      </div>
    </div>
  `;
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

// Top-posts winner-selection screen — Archie's intro turn above a visual grid
// of top-post cards (renderTopPostsGrid). Reuses the wizard chat shell so the
// thread subscriber + scroll-pin + drag rebind in wireAssistantPanel keep
// working; the grid sits in the scrollable chat area (no sticky picker bar —
// clicking a card advances straight to the reuse-mode step).
// Workflow header steps — mirrors the Batch / Clip studio intros so the
// milker reads as a first-class workflow, not a bare grid.
const TOP_POSTS_STEPS = [
  {
    tone: "in",
    icon: "ap-icon-feature-analytics",
    title: "Pick an account",
    text: "Choose a connected account to pull your best-performing posts from.",
  },
  {
    tone: "ai",
    icon: "ap-icon-archie-official",
    title: "See the winners",
    text: "I rank its posts by engagement — pick one and a fresh angle.",
  },
  {
    tone: "out",
    icon: "ap-icon-stack",
    title: "Reuse into drafts",
    text: "I write fresh versions in your playbook's voice — ready to review and schedule.",
  },
];

function renderTopPostsPickerScreen(session) {
  const state = topPostsFlow.getPickerState(session.id);
  if (!state) return "";
  // No published history yet (new user) — the studio opens straight onto a
  // dedicated empty state instead of the account chooser. A single "Back to
  // chat" affordance (also Esc) is the only way out since there's nothing to
  // pick.
  if (state.stage === "empty") {
    return html`
      <aside
        class="session__assistant session__assistant--wizard session__assistant--board"
        aria-label="Assistant panel"
      >
        <div class="analyse__chat session__assistant-board-chat">
          <div class="analyse__chat-inner session__assistant-board-inner">
            <div class="top-posts-intro">
              <span class="top-posts-intro__badge"
                ><i class="ap-icon-feature-analytics" aria-hidden="true"></i>Top posts</span
              >
            </div>
            ${raw(
              renderEmptyState({
                icon: "ap-icon-feature-analytics",
                title: "No top posts to reuse yet",
                body: "Once your posts start performing, I'll surface your winners here so you can spin fresh drafts out of what already works. Publish a few and come back.",
                actionHtml:
                  '<button type="button" class="ap-button stroked" data-topposts-exit><span>Back to chat</span></button>',
              }),
            )}
          </div>
        </div>
      </aside>
    `;
  }
  // A studio-style screen (like Batch / Clip): a centered intro header, then a
  // stage-dependent body — profile chooser (step 1) → loading beat → winner
  // board. Distinct container classes (not #inlineQuestionChat / wizard-chat) so
  // the chat scroll-pin in wireAssistantPanel doesn't yank it to the bottom.
  const account = state.profile ? profileForNetwork(state.profile) : null;
  const profileName = account?.handle || "";

  let intro;
  let body;
  if (state.stage === "profile") {
    // Step 1 — pick which connected account to mine. This is the *exact* in-chat
    // picker component (inlineQuestion.ask, armed by top-posts-flow when the
    // profile stage opens): we render its chrome (handler "inline-question")
    // inside the studio framing (workflow roadmap + a keyboard hint bar), so it
    // reads — and behaves — like every other in-chat pick. Single-select:
    // clicking a row (or pressing its digit) routes through the shared
    // inline-question delegate → inlineQuestion.pick → chooseProfile.
    intro =
      "Pick a connected account and I'll surface its best-performing posts — reuse any into fresh drafts in your playbook's voice.";
    const picker = renderPicker(inlineQuestion.renderChrome(session.id)?.picker);
    // The Playbook whose voice the repurposed drafts will follow, chosen here on
    // step 1 (defaults to the workspace default; persists through to generation).
    const playbookCtx = getContextById(topPostsFlow.getContextId(session.id));
    // The account is highlighted (not advanced) on click; "Next" confirms the
    // account + Playbook together. Disabled until an account is selected.
    const selectedAccount = inlineQuestion.getSelected(session.id);
    body = html`
      ${raw(buildWorkflowFlow(TOP_POSTS_STEPS))}
      <div class="top-posts-account-picker">
        ${raw(picker)}
        <div class="studio-commit">
          <div class="studio-commit__row">
            ${raw(renderTopPostsPlaybookControl(playbookCtx))}
            <button
              type="button"
              class="ap-button primary blue studio-commit__cta"
              data-topposts-next
              ${selectedAccount ? "" : "disabled"}
            >
              <span>Show my ${TOP_POSTS_LIMIT} top posts</span>
            </button>
          </div>
          <p class="studio-commit__hint muted">I'll write the fresh drafts in this playbook's voice.</p>
        </div>
      </div>
    `;
  } else if (state.stage === "loading") {
    intro = profileName ? `Loading your top posts from ${profileName}…` : "Loading your top posts…";
    body = html`
      <div class="top-posts-loading" role="status" aria-live="polite">
        <span class="archie-loader" style="--archie-loader-size: 44px"></span>
        <span class="top-posts-loading__label">Pulling ${profileName || "your"} winners…</span>
      </div>
    `;
  } else {
    intro = profileName
      ? `Your top-performing posts on ${profileName} — pick one to spin fresh angles.`
      : "Pick one of your best-performing posts to spin fresh angles.";
    body = html`
      ${raw(buildWorkflowFlow(TOP_POSTS_STEPS))}
      ${raw(
        renderTopPostsBoard({
          posts: state.posts,
          sort: state.sort,
          profile: state.profile,
          period: state.period,
        }),
      )}
    `;
  }

  return html`
    <aside class="session__assistant session__assistant--wizard session__assistant--board" aria-label="Assistant panel">
      <div class="analyse__chat session__assistant-board-chat">
        <div class="analyse__chat-inner session__assistant-board-inner">
          <div class="top-posts-intro">
            <span class="top-posts-intro__badge"
              ><i class="ap-icon-feature-analytics" aria-hidden="true"></i>Top posts</span
            >
            <h1 class="top-posts-intro__title">Reuse your best-performing posts</h1>
            <p class="top-posts-intro__sub">${intro}</p>
          </div>
          ${raw(body)}
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
  //
  // First Time User ALT — when the chat is mounted inside a
  // /session/welcome-alt-* route, prepend a marketing hero (eyebrow +
  // headline + paragraph) above the chat thread so the entry feels less
  // bare than the standalone conversational layout. Reuses the
  // `.welcome-hero` block from welcome.css for layout + typography
  // (flex column, gap, 520px reading width); `.welcome-alt-hero` only
  // owns the outer positioning inside the wizard aside (column width
  // matching .analyse__chat-inner + top/bottom padding).
  const isWelcomeAlt = session.id.startsWith("welcome-alt-");
  const heroMarkup = isWelcomeAlt
    ? html`
        <header class="welcome-alt-hero">
          <span class="welcome-alt-hero__orb" aria-hidden="true"></span>
          <div class="welcome-hero welcome-hero--alt">
            <span class="welcome-hero__eyebrow">
              <i class="ap-icon-archie-official" aria-hidden="true"></i>
              Welcome
            </span>
            <h1 class="welcome-hero__title">Let's understand<br />your brand.</h1>
            <p class="welcome-hero__sub">
              Point me at your website and I'll capture what makes your brand yours — then shape it into a Playbook that
              guides every post toward your voice.
            </p>
            <ul class="welcome-alt-hero__chips" aria-hidden="true">
              <li class="welcome-alt-hero__chip">
                <i class="ap-icon-single-chat-bubble" aria-hidden="true"></i>
                Voice
              </li>
              <li class="welcome-alt-hero__chip">
                <i class="ap-icon-multiple-users" aria-hidden="true"></i>
                Audience
              </li>
              <li class="welcome-alt-hero__chip">
                <i class="ap-icon-image" aria-hidden="true"></i>
                Brand colors
              </li>
            </ul>
          </div>
        </header>
      `
    : "";
  return html`
    <aside class="session__assistant session__assistant--wizard" aria-label="Assistant panel">
      <div class="session__assistant-wizard-chat analyse__chat" id="inlineQuestionChat">
        ${raw(heroMarkup)}
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
function askWhatToKnow(sessionId, filename, sourceId = null) {
  // Echo the chosen source as a selection card so the pick stays visible.
  const src = sourceId ? getStreamSources(sessionId).find((s) => s.id === sourceId) : null;
  postSelectionEcho(sessionId, {
    icon: fileIconForKind(src?.kind),
    title: filename || "this source",
    meta: src?.kind ? `${src.kind} source` : "Source",
  });
  postAssistantMessage(sessionId, `What would you like to know about **${filename}**?`);
  inlineQuestion.ask(sessionId, {
    title: filename || "About this source",
    stepLabel: "Source",
    items: [
      { value: "What's the main takeaway?", label: "What's the main takeaway?", icon: "ap-icon-archie-official" },
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
  const sectionTitle = section === "voice" ? "Voice profile" : section === "brief" ? "Brief" : "Branding";
  postAssistantMessage(
    session.id,
    `Editing the ${sectionTitle.toLowerCase()} will apply to every chat using this Playbook.`,
  );
  inlineQuestion.ask(session.id, {
    title: `Edit the ${sectionTitle}?`,
    stepLabel: "Confirm",
    items: [
      {
        value: "continue",
        label: `Yes, edit ${sectionTitle}`,
        caption: "Open the editor. Changes apply to every chat using this Playbook.",
        icon: "ap-icon-check",
      },
      {
        value: "cancel",
        label: "Cancel",
        caption: "Leave the Playbook as is.",
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
      const sectionTitle = section === "voice" ? "Voice profile" : section === "brief" ? "Brief" : "Branding";
      if (contextId) updateContext(contextId, { updatedAt: "just now" });
      postAssistantMessage(session.id, `${sectionTitle} updated in every chat that uses this Playbook.`);
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
      askWhatToKnow(sessionId, filename, sourceId);
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

// Provenance for a draft cut from a video clip → the collapsible "Generation
// context" panel (post-card.js): the clip it was generated from as the
// headline + the source video it was cut out of. Mirrors ideaContext /
// repurposeContext in draft-flow / top-posts-flow.
function clipContext(clip, sourceName) {
  return {
    kind: "clip",
    headline: { icon: "ap-icon-video", text: `Clip · ${clip.title}` },
    source: {
      icon: "ap-icon-file--video",
      label: sourceName || "Video source",
      detail: clip.summary || "",
    },
  };
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
      const drafts = selectedClips.map((clip) => {
        const d = addPostDraft(session.id, {
          network: clip.network,
          text: [clip.title, clip.summary].filter(Boolean),
          hashtags: (clip.tags || []).map((t) => `#${t}`),
          clipRef: {
            start: clip.start,
            end: clip.end,
            sourceName: src.filename,
            hue: clip.hue,
          },
        });
        d.generationContext = clipContext(clip, src.filename);
        return d;
      });
      postDraftResult(session.id, {
        ideaTitle: `From ${src.filename}`,
        drafts,
      });
      if (isFlagOn("statusActionSnackbars")) {
        showToast(`Drafted ${drafts.length} post${drafts.length === 1 ? "" : "s"} from ${src.filename}`, {
          duration: 3200,
        });
      }
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
// pendingDraftIdeaId hand-off in handoff.js). The chosen profile's platform
// becomes the draft's network so the user gets posts on the surface they
// actually want to publish to. `count` is threaded through from the count
// picker; `onBack` lets the second-step picker return to the first.
// External entry to the draft-from-idea flow — echoes the chosen idea as a
// selection card (so the pick stays visible) then opens the profile step.
// Internal steps (count / angle / Back) call askProfileQuestion directly, so
// the idea echo is posted exactly once, at selection time.
// The Playbook languages backing this chat (primary first). Falls back to the
// default Playbook + "English" so the flow always has a language to write in.
function playbookLanguages(sessionId) {
  const session = getSessionById(sessionId);
  const ctx = session?.contextId ? getContextById(session.contextId) : getDefaultContext();
  const langs = ctx && Array.isArray(ctx.languages) && ctx.languages.length ? ctx.languages.slice() : null;
  const primary = ctx?.primaryLanguage || (langs && langs[0]) || ctx?.language || "English";
  return { languages: langs || [primary], primary };
}

// Language gate for the draft flow. When the Playbook publishes in more than
// one language, ask which to write in (default = primary) and echo the pick;
// otherwise skip silently. Posts are then generated in that language using its
// native Voice examples — never a translation. `proceed(language)` continues.
function askLanguageQuestion(sessionId, ideaId, proceed) {
  const { languages, primary } = playbookLanguages(sessionId);
  // Multilingual gated behind a flag (default OFF) — and skip when there's only
  // one language to choose from anyway.
  if (!isFlagOn("multilingualPlaybook") || languages.length <= 1) {
    proceed(primary);
    return;
  }
  postAssistantMessage(sessionId, "Which language should I write in?");
  inlineQuestion.ask(sessionId, {
    title: "Choose a language",
    stepLabel: "Language",
    items: languages.map((l) => ({
      value: l,
      label: l,
      caption: l === primary ? "Primary — your Playbook default" : undefined,
      icon: "ap-icon-web",
    })),
    onPick: (lang) => {
      const chosen = languages.includes(lang) ? lang : primary;
      postSelectionEcho(sessionId, { icon: "ap-icon-web", title: chosen, meta: "Language" });
      proceed(chosen);
    },
    // A default always exists, so Skip writes in the primary language.
    onSkip: () => proceed(primary),
  });
}

function startIdeaDraft(sessionId, ideaId) {
  const idea = getIdeas(sessionId).find((i) => i.id === ideaId);
  if (idea) {
    const srcName = (idea.sourceIds || []).length
      ? getStreamSources(sessionId).find((s) => s.id === idea.sourceIds[0])?.filename
      : "";
    postSelectionEcho(sessionId, {
      icon: "ap-icon-archie-official",
      title: idea.title,
      meta: srcName ? `Idea · from ${srcName}` : "Idea",
    });
  }
  askLanguageQuestion(sessionId, ideaId, (language) => askProfileQuestion(sessionId, ideaId, { language }));
}

function askProfileQuestion(
  sessionId,
  ideaId,
  { count = 1, angle = null, anglePicks = null, onBack = null, language = null } = {},
) {
  // Connected profiles + their picker presentation come from the shared
  // social-profiles helper, so this picker proposes the exact same
  // accounts (brand handle + avatar with network badge) as the Playbook
  // onboarding profile step.
  const connected = getConnectedProfiles();
  if (connected.length === 0) {
    postAssistantMessage(
      sessionId,
      "No connected social profiles yet. Open Settings → Social accounts to connect one.",
    );
    return;
  }
  postAssistantMessage(sessionId, "Which profile should I draft this for?");
  const profileItems = buildConnectedProfileItems();
  inlineQuestion.ask(sessionId, {
    title: "Pick a connected social profile",
    stepLabel: "Profile",
    items: profileItems,
    // With a lot of connected accounts, a flat list is slow to scan — add a
    // live search box so the user can filter by name/handle/network.
    searchable: profileItems.length > PROFILE_SEARCH_THRESHOLD,
    searchPlaceholder: "Search profiles by name, handle or network…",
    onPick: (accountId) => {
      const account = connected.find((a) => a.id === accountId);
      // Echo the pick as a visual profile chip (avatar + handle) so selecting a
      // profile gives the same object-preview feedback as picking a post — not
      // a plain text bubble. Mirrors the multi-account batch path below.
      if (account) postUserProfilesTurn(sessionId, [account]);
      const channels = account?.platform ? [account.platform] : null;
      // Multi-angle batch (from the angle stepper) → one draft run that
      // produces each angle's count. Otherwise the legacy single-angle path.
      if (anglePicks && anglePicks.length) {
        executeDraftBatch(sessionId, ideaId, channels, anglePicks, language);
      } else {
        startDraftFlow(sessionId, ideaId, count, channels, angle, language);
      }
    },
    onBack: onBack || undefined,
    onSkip: onBack ? undefined : () => {},
  });
}

// ── Published-posts repurposing (top-posts flow) ──────────────────────
// The winner board (top-posts-flow.js) hands off here once the user picks one or
// more winners — via a card's "Repurpose" or the bulk bar. We echo the picks,
// then go straight to the profiles step and generate the network-adapted drafts.
function startRepurposeFlow(sessionId, postIds) {
  const ids = topPostsFlow.echoRepurposePicks(sessionId, postIds);
  if (!ids.length) return;
  askRepurposeProfiles(sessionId, ids);
}

// Profile-selection — a SINGLE unified per-profile version stepper (no separate
// "same vs other" scope step). Lists every connected profile: source-network
// profiles first, tagged "· Source". Every profile starts at 0 — the user opts
// in explicitly. "Generate N drafts" sums the counts and each draft is adapted
// to its profile's network. This is the first (and only) step after the picks
// are echoed — every repurpose entry point funnels here, so they all behave
// identically.
function askRepurposeProfiles(sessionId, postIds) {
  // Every profile starts at 0 (fully opt-in); source profiles just lead the list.
  const items = topPostsFlow.repurposeProfileItems(postIds, { include: "all" }).map((it) => ({ ...it, count: 0 }));
  if (!items.length) {
    postAssistantMessage(
      sessionId,
      "No connected profiles to repurpose to. Connect one in Settings → Social accounts.",
    );
    return;
  }
  postAssistantMessage(sessionId, "Where should I repurpose these?");
  inlineQuestion.ask(sessionId, {
    title: "Pick the profiles to repurpose to",
    subtitle: "Set how many versions I'll write for each profile — leave one at 0 to skip it.",
    stepLabel: "Versions per profile",
    // Per-profile version counter, capped so a single run stays scannable.
    stepper: true,
    countMin: 0,
    countMax: 5,
    submitCountLabel: (total) => `Generate ${total} draft${total === 1 ? "" : "s"}`,
    items,
    // Long profile lists get a live search box to filter down before setting counts.
    searchable: items.length > PROFILE_SEARCH_THRESHOLD,
    searchPlaceholder: "Search profiles by name, handle or network…",
    onPick: ({ picks, total }) => {
      // Each pick is { value: accountId, count } (count already > 0). Resolve
      // to the account + its network, echo the chosen profiles as chips, then
      // generate `count` versions per profile.
      const targets = picks
        .map((p) => ({ account: getConnectedProfiles().find((a) => a.id === p.value) || null, count: p.count }))
        .filter((t) => t.account);
      postUserProfilesTurn(
        sessionId,
        targets.map((t) => t.account),
      );
      postUserTurn(
        sessionId,
        `${total} draft${total === 1 ? "" : "s"} · ${targets.length} profile${targets.length === 1 ? "" : "s"}`,
      );
      const networkTargets = targets.map((t) => ({
        network: t.account.platform === "twitter" ? "x" : t.account.platform,
        count: t.count,
      }));
      topPostsFlow.executeRepurpose(sessionId, postIds, networkTargets);
    },
  });
}

// "Draft a post from this idea" — step 1: pick an angle. Triggered by the
// right-panel Ideas card "Draft" button. Archie suggests 4 AI-generated
// angles (title + short description) the idea could be reframed into; the
// chosen angle is threaded through the rest of the flow (count → profile →
// generate) so the produced drafts reflect it. Mirrors the screenshot
// pattern by reusing the inline-question numbered-card picker.
export function askAngleQuestion(sessionId, ideaId, { language = null } = {}) {
  // Language gate first (once) — then re-enter with the chosen language so it
  // threads through the angle → count → profile → generate chain.
  if (language === null) {
    askLanguageQuestion(sessionId, ideaId, (lang) => askAngleQuestion(sessionId, ideaId, { language: lang }));
    return;
  }
  const angles = getAnglesForIdea(sessionId, ideaId);
  // No resolvable idea / angles — fall back to the original count flow so
  // the Draft button never dead-ends.
  if (!angles.length) {
    askDraftCountQuestion(sessionId, ideaId, { language });
    return;
  }
  postAssistantMessage(sessionId, "Let's draft from these angles.");
  // The quick picker shows a brand loader (~4s) while Archie "finds the
  // angles", then swaps in the real angle stepper. Cancelling during the
  // loader aborts the reveal.
  inlineQuestion.ask(sessionId, {
    loading: true,
    title: "Suggested angles",
    subtitle: "Finding the strongest angles for this idea…",
    skipLabel: "Cancel",
    onSkip: () => {},
  });
  window.setTimeout(() => {
    if (!inlineQuestion.isActive(sessionId)) return;
    inlineQuestion.ask(sessionId, {
      title: "Suggested angles",
      subtitle: "Set how many drafts I'll write for each angle — leave one at 0 to skip it.",
      stepLabel: "Drafts per angle",
      skipLabel: "Cancel",
      // Stepper mode — each angle row carries its own drafts counter (0 to
      // skip an angle). "Generate N drafts" sums every angle and advances
      // straight to the profile step, where the whole batch is produced.
      stepper: true,
      defaultCount: 1,
      countMin: 0,
      countMax: 20,
      submitCountLabel: (total) => `Generate ${total} draft${total === 1 ? "" : "s"}`,
      items: angles.map((a) => ({
        value: a.id,
        label: a.title,
        caption: a.description,
      })),
      onPick: ({ picks }) => {
        // Map each picked angle id → its angle object + count.
        const anglePicks = picks
          .map((p) => ({ angle: angles.find((a) => a.id === p.value) || null, count: p.count }))
          .filter((p) => p.angle && p.count > 0);
        const total = anglePicks.reduce((sum, p) => sum + p.count, 0);
        // Echo the batch as a user turn so it stays visible once the picker
        // unmounts — e.g. "3 drafts · 2 angles".
        postUserTurn(
          sessionId,
          `${total} draft${total === 1 ? "" : "s"} · ${anglePicks.length} angle${anglePicks.length === 1 ? "" : "s"}`,
        );
        askProfileQuestion(sessionId, ideaId, {
          anglePicks,
          language,
          // ← Back returns to the angle picker so the user can re-choose.
          onBack: () => askAngleQuestion(sessionId, ideaId, { language }),
        });
      },
      // First step of the flow — no earlier question, so it's Cancel (not Back).
      onSkip: () => {},
    });
  }, 4000);
}

// Step 2: how many drafts. Threads the chosen `angle` through to the
// profile picker. When reached from the angle step (`onBack` set) the
// picker shows a Back affordance; entered directly it shows Cancel.
export function askDraftCountQuestion(sessionId, ideaId, { angle = null, onBack = null, language = null } = {}) {
  postAssistantMessage(sessionId, "How many drafts should I generate?");
  const advance = (count) => {
    // Clamp to a reasonable range — single-digit + custom typed numbers
    // can land outside it (0, negative, NaN). 1 floors any nonsense.
    const n = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
    // Echo the count as a user turn so the pick stays visible once the
    // picker unmounts (covers both the preset chips and the custom input).
    postUserTurn(sessionId, `${n} draft${n === 1 ? "" : "s"}`);
    askProfileQuestion(sessionId, ideaId, {
      count: n,
      angle,
      language,
      // ← Back returns to the count picker so the user can change their mind.
      onBack: () => askDraftCountQuestion(sessionId, ideaId, { angle, onBack, language }),
    });
  };
  inlineQuestion.ask(sessionId, {
    title: "How many drafts from this idea?",
    stepLabel: "Drafts",
    skipLabel: "Cancel",
    items: [
      { value: 1, label: "1 draft" },
      { value: 3, label: "3 drafts" },
      { value: 5, label: "5 drafts" },
    ],
    customPlaceholder: "Or type any number (1–20)",
    onPick: advance,
    onCustom: advance,
    // When chained from the angle step, offer Back to it instead of Cancel.
    onBack: onBack || undefined,
    onSkip: onBack ? undefined : () => {},
  });
}

// ── Draft from clips — quick picker (ratio → subtitles → accounts) ──
//
// Triggered by a clip-card "Draft" button (a single clip) or the Clips-panel
// footer CTA (several selected clips). Each step is the inline-question picker
// and every pick is echoed as a user turn. The flow asks once for an export
// ratio, then a subtitle style, then the target account(s), and finally
// generates one post draft per (clip × account) — each carrying the chosen
// ratio + subtitle style + a back-reference to its source clip — then posts a
// "N drafts to review" result card.
//
// `entries` is [{ clip, sourceName, sourceId }] — one per selected clip.

// Subtitle-style catalog for the clip-draft flow lives in clip-subtitles.js
// (shared with the handoff gallery). CLIP_SUBTITLE_ITEMS = the picker cards;
// CLIP_SUBTITLE_LABEL = id → label for echoing the pick back into the chat.

export function startClipDraftFlow(sessionId, entries) {
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  if (!list.length) return;
  // Echo the picked clip(s) as a selection card before the format question.
  const first = list[0];
  postSelectionEcho(sessionId, {
    icon: "ap-icon-file--video",
    title: list.length === 1 ? first.clip?.title || "Clip" : `${list.length} clips`,
    meta: first.sourceName ? `Clip · ${first.sourceName}` : "Video clip",
  });
  askClipFormat(sessionId, list);
}

// Step 1 — which aspect ratio? All export formats are offered as visual
// proportion tiles (the target accounts aren't picked yet, so we don't filter
// by network). Items come from clip-formats.clipFormatItems() (shared with the
// handoff gallery).
function askClipFormat(sessionId, entries) {
  postAssistantMessage(sessionId, "What aspect ratio would you like for the clips?");
  inlineQuestion.ask(sessionId, {
    title: "Pick an export format",
    stepLabel: "Ratio",
    skipLabel: "Cancel",
    variant: "cards",
    items: clipFormatItems(),
    onPick: (formatId) => {
      const fmt = FORMATS[formatId];
      postUserTurn(sessionId, fmt ? `${fmt.tag} · ${fmt.label}` : formatId);
      askClipSubtitle(sessionId, entries, formatId);
    },
    onSkip: () => {},
  });
}

// Step 2 — which subtitle style? (AI-generated, burned into the video.) Shown
// as a 2-column card grid, each card CSS-rendering the style on a "MAKE IT POP"
// mock; the pick echoes back as a selection card.
function askClipSubtitle(sessionId, entries, format) {
  postAssistantMessage(sessionId, "Choose a subtitle style — I'll generate and burn them into the video.");
  inlineQuestion.ask(sessionId, {
    title: "Choose a subtitle style",
    stepLabel: "Subtitles",
    variant: "cards",
    // Fixed 3×3 grid — "No subtitles" is the first card (see CLIP_SUBTITLE_ITEMS).
    cardCols: 3,
    items: CLIP_SUBTITLE_ITEMS,
    onPick: (style) => {
      postSelectionEcho(sessionId, {
        icon: "ap-icon-closed-captions",
        title: CLIP_SUBTITLE_LABEL[style] || style,
        meta: style === "none" ? "No subtitles" : "Subtitle style",
      });
      askClipAccounts(sessionId, entries, format, style);
    },
    onBack: () => askClipFormat(sessionId, entries),
  });
}

// Step 3 — which account(s)? Multi-select, the clips' own networks preselected.
function askClipAccounts(sessionId, entries, format, style) {
  const connected = getConnectedProfiles();
  if (connected.length === 0) {
    postAssistantMessage(
      sessionId,
      "No connected social profiles yet. Open Settings → Social accounts to connect one.",
    );
    return;
  }
  postAssistantMessage(sessionId, "Which account(s) should I draft for?");
  const clipNets = new Set(entries.map((e) => e.clip.network));
  const preset = connected.filter((a) => clipNets.has(a.platform)).map((a) => a.id);
  // Destination picker (not an analysis step) — every connected account is a
  // valid target, so don't gate on post history.
  const clipProfileItems = buildConnectedProfileItems({ requirePosts: false });
  inlineQuestion.ask(sessionId, {
    title: "Pick one or more connected accounts",
    stepLabel: "Accounts",
    skipLabel: "Cancel",
    multi: true,
    defaultSelected: preset,
    submitLabel: "Continue",
    // A long list of destinations gets a live search box to narrow it down.
    searchable: clipProfileItems.length > PROFILE_SEARCH_THRESHOLD,
    searchPlaceholder: "Search accounts by name, handle or network…",
    items: clipProfileItems,
    onPick: (ids) => {
      const accounts = (Array.isArray(ids) ? ids : [ids])
        .map((id) => connected.find((a) => a.id === id))
        .filter(Boolean);
      if (accounts.length === 0) return;
      // Echo the picked profiles via the canonical renderProfileTag — pass
      // the raw socialAccounts entries straight through.
      postUserProfilesTurn(sessionId, accounts);
      generateClipDrafts(sessionId, entries, accounts, format, style);
    },
    onBack: () => askClipSubtitle(sessionId, entries, format),
    onSkip: () => {},
  });
}

// Generate one post draft per (clip × account), then post the result card.
// Each draft's clipRef carries sourceId + clipId so the post can later open
// the source clip back in the Video Clips modal for editing.
function generateClipDrafts(sessionId, entries, accounts, format, style) {
  const pendingId = startPending(sessionId, "Generating drafts");
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    const drafts = [];
    for (const { clip, sourceName, sourceId } of entries) {
      for (const a of accounts) {
        const d = addPostDraft(sessionId, {
          network: a.platform,
          text: [clip.title, clip.summary].filter(Boolean),
          hashtags: (clip.tags || []).map((t) => `#${t}`),
          clipRef: { start: clip.start, end: clip.end, sourceName, hue: clip.hue, sourceId, clipId: clip.id },
          format,
          subtitleStyle: style === "none" ? null : style,
        });
        d.generationContext = clipContext(clip, sourceName);
        drafts.push(d);
      }
    }
    const title = entries.length === 1 ? entries[0].clip.title : `${entries.length} clips`;
    postDraftResult(sessionId, { ideaTitle: title, drafts });
  }, 1600);
}

// "What would you like to do with this video?" — asked via the quick picker
// once a freshly-added video is processed (intake-lifecycle → onVideoReady).
// Each option carries a caption explaining what it does; picking one echoes
// it as a user turn and runs only that branch.
function askVideoIntake(sessionId, sourceId, filename) {
  postAssistantMessage(sessionId, "What would you like to do with this video?");
  inlineQuestion.ask(sessionId, {
    title: "Use this video",
    stepLabel: "Video",
    skipLabel: "Cancel",
    items: [
      {
        value: "ideas",
        label: "Analyze for ideas",
        caption: "Pull the key themes and talking points into your Ideas to draft posts from.",
        icon: "ap-icon-archie-official",
      },
      {
        value: "clips",
        label: "Extract & create clips",
        caption: "Cut the video into short, post-ready clips you can caption and publish.",
        icon: "ap-icon-video",
      },
    ],
    onPick: (value) => {
      if (value === "ideas") {
        postUserTurn(sessionId, "Analyze for ideas");
        runVideoIdeasChoice(sessionId, sourceId, filename);
      } else if (value === "clips") {
        postUserTurn(sessionId, "Extract & create clips");
        runVideoClipsChoice(sessionId, sourceId, filename);
      }
    },
    onSkip: () => {},
  });
}

// ── Video-intake choice branches ──────────────────────────────────────────
// Run after the user answers "what to do with this video?" (intake-lifecycle).
// Extraction is deferred at upload, so each branch produces only its output.

// "Analyze for ideas" — brief thinking chip, inject the canned video ideas,
// surface the source-intake "N ideas" pill, then post the rich extraction turn.
function runVideoIdeasChoice(sessionId, sourceId, filename) {
  const pendingId = startPending(sessionId, "Extracting ideas");
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    const ideas = extractVideoIdeas(sessionId, sourceId);
    setSourceIdeaCount(sessionId, sourceId, ideas.length);
    postExtractionResult(sessionId, { filename, ideas });
  }, 1600);
}

// "Extract & create clips" — post the clip-extraction turn (renders pending,
// cycling through explanatory stages while no clips exist yet), then kick off
// the staged ~7.5s extraction. The ticker owns the timing and flips the turn to
// "ready" (via clipExtractionStatus) once the clips are attached.
function runVideoClipsChoice(sessionId, sourceId, filename) {
  postClipExtractionTurn(sessionId, { sourceId, filename });
  extractClipsForSource(sessionId, sourceId);
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
    const source = message.sourceId ? getStreamSources(sessionId).find((s) => s.id === message.sourceId) : null;
    return renderSourceIntakeTurn(message, source);
  }

  // AI extraction result — Figma 25:1053.
  if (message.role === "assistant" && message.variant === "extraction") {
    return renderExtractionTurn(message, sessionId);
  }

  // Draft result — intentionally NOT rendered inline. Drafts can finish at any
  // time (incl. while the user is doing something else), so a card here would
  // interleave the conversation unpredictably. The message is kept in the thread
  // only as the batch anchor for the Drafts panel; "ready" is surfaced via a
  // toast + the persistent topbar Drafts count (see the offThread subscription).
  if (message.role === "assistant" && message.variant === "draft") {
    return "";
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

  // Profiles echo — right-aligned avatar (+ network badge) + handle chips,
  // used when the user picks which account(s) to draft a clip for.
  if (message.role === "user" && message.variant === "profiles") {
    return renderProfilesTurn(message);
  }

  if (message.role === "user" && message.variant === "top-post-pick") {
    return `
      <div class="chat-turn chat-turn--user">
        <span class="chat-turn-role">You</span>
        ${renderTopPostEcho(message.post)}
      </div>
    `;
  }

  // Inline "top posts" selection widget — the Add-menu flow's in-chat board.
  if (message.role === "assistant" && message.variant === "top-posts-widget") {
    return renderTopPostsWidgetTurn(message);
  }

  if (message.role === "user" && message.variant === "selection-echo") {
    return renderSelectionEchoTurn(message.echo);
  }

  // Channel-picker choice turn — chip row + "Draft them" button.
  if (message.role === "assistant-choice") {
    return renderChoiceTurn(message);
  }

  // Drafting / system notices — mermaid status pill + optional detail body.
  if (message.role === "system") {
    return renderSystemNotice(message);
  }

  // "Connect this service first" prompt — shown when a pasted link points to a
  // connector-backed service that isn't connected yet.
  if (message.role === "connect-prompt") {
    return renderConnectPromptTurn(message);
  }

  return renderMessageBubble(message);
}

// Inline "top posts" selection widget turn — an AI-side turn hosting the
// interactive multi-select card (renderTopPostsWidget). Resolves the post ids to
// live winners each render; selection + answered state live on the turn message.
function renderTopPostsWidgetTurn(message) {
  const posts = (message.postIds || []).map(getTopPost).filter(Boolean);
  return `
    <div class="chat-turn chat-turn--ai">
      <i class="ap-icon-archie-official chat-turn-avatar" aria-hidden="true"></i>
      ${renderTopPostsWidget({
        network: message.network,
        posts,
        selected: message.selected || [],
        answered: message.status === "answered",
        group: message.id,
      })}
    </div>
  `;
}

// Visual echo of the selected profiles — a right-aligned wrap of cards, each
// styled like every other selection echo in the thread (rounded navy-tint card,
// avatar + two lines: profile NAME, then the @handle / "Platform · Kind").
// Canonical renderer: social-profiles.renderProfileEchoCard. The payload is the
// raw socialAccounts entries picked in the accounts step.
function renderProfilesTurn(message) {
  const chips = (message.profiles || [])
    .map((account) => renderProfileEchoCard(account, { network: account?.platform }))
    .join("");
  return `
    <div class="chat-turn chat-turn--user">
      <span class="chat-turn-role">You</span>
      <div class="chat-profiles">${chips}</div>
    </div>
  `;
}

// Generic "you picked this object" echo — icon + title + meta chip. Posted via
// assistant.postSelectionEcho when the user selects a source / idea / clip / …
// so the pick stays visible in the thread.
function renderSelectionEchoTurn(echo) {
  if (!echo) return "";
  return `
    <div class="chat-turn chat-turn--user">
      <span class="chat-turn-role">You</span>
      <div class="selection-echo">
        <span class="selection-echo__icon"><i class="${escapeHtml(echo.icon || "ap-icon-file")}" aria-hidden="true"></i></span>
        <span class="selection-echo__body">
          <span class="selection-echo__title">${escapeHtml(echo.title || "")}</span>
          ${echo.meta ? `<span class="selection-echo__meta">${escapeHtml(echo.meta)}</span>` : ""}
        </span>
      </div>
    </div>
  `;
}

// "Connect this service first" prompt — Archie can't import a pasted link
// because its backing connector (Slite, Notion, …) isn't connected. Renders an
// AI turn with the explanation + a Connect (logo-branded) / Close action row.
// The Connect click delegate connects the service and retries the import; the
// turn then collapses to a one-line confirmation.
function renderConnectPromptTurn(message) {
  if (message.status === "dismissed") return "";

  // Resolved — a standalone success status (green wash + filled check), not an
  // AI chat reply. Mirrors the connect-card so the request → success reads as
  // one coherent block.
  if (message.status === "connected") {
    return `
      <div class="connect-status" role="status">
        <i class="ap-icon-rounded-check_fill connect-status__icon" aria-hidden="true"></i>
        <p class="connect-status__text">
          <strong>${escapeHtml(message.connectorName)} connected</strong> — importing your ${escapeHtml(
            message.noun,
          )} now.
        </p>
      </div>
    `;
  }

  // Standalone connection card (not a chat bubble) — reused for any "connect a
  // service" or "grant an authorization" request. Header = connector logo tile
  // + name + a state pill; one supporting line; primary Connect + ghost Cancel.
  // The connector logo sits in a white rounded tile so a single-colour brand
  // mark always reads on a light surface. Falls back to the Archie sparkle.
  const name = escapeHtml(message.connectorName);
  const logo = message.logo
    ? `<img src="${escapeHtml(message.logo)}" alt="" />`
    : `<i class="ap-icon-archie-official" aria-hidden="true"></i>`;
  return `
    <div class="connect-card" role="group" aria-label="Connect ${name}">
      <div class="connect-card__head">
        <span class="connect-card__logo" aria-hidden="true">${logo}</span>
        <div class="connect-card__heading">
          <span class="connect-card__title">${name}</span>
          <span class="connect-card__sub">Connect to import this ${escapeHtml(
            message.noun,
          )} — I'll retry automatically.</span>
        </div>
        <span class="ap-status grey no-dot connect-card__state">Not connected</span>
      </div>
      <div class="connect-card__actions">
        <button type="button" class="ap-button primary blue" data-connect-prompt-connect="${escapeHtml(message.id)}">
          Connect ${name}
        </button>
        <button type="button" class="ap-button ghost grey" data-connect-prompt-dismiss="${escapeHtml(message.id)}">
          Cancel
        </button>
      </div>
    </div>
  `;
}

// Inline "Extracting" notice (Figma 25:1413) — mermaid status pill + small
// blue spinner, sits in the thread while a source extraction is in flight.
// Wrapped in role=status + aria-label so screen readers announce that
// extraction is running (the bare "Extracting" pill is meaningless out
// of context).
// Per-idea interaction state for the extraction-turn cards (the shared compact
// idea card is a pure renderer, so the consumer owns this). Toggled by the
// data-rpanel-* handlers in bindSession, which then repaint the single card.
const extractionVerdict = new Map(); // ideaId → 'up' | 'down'
const extractionWhyOpen = new Set(); // ideaIds with the Why panel expanded

function renderExtractionTurn(message, sessionId) {
  const count = message.count ?? (message.ideas ? message.ideas.length : 0);
  // Render the EXACT shared idea card (renderCompactIdeaCard) used by the
  // right-panel Ideas mode + the standalone Ideas page — feedback + Mention +
  // Draft. The thread message only carries {id,title,body}, so resolve the full
  // idea (kind / Source / rationale) from the library by id, like the panel does.
  const sources = sessionId ? getStreamSources(sessionId) : [];
  const byId = new Map((sessionId ? getIdeas(sessionId) : []).map((i) => [i.id, i]));
  const cards = (message.ideas || [])
    .map((m) => {
      const idea = byId.get(m.id) || m;
      return renderCompactIdeaCard(idea, sources, {
        verdict: extractionVerdict.get(idea.id) || null,
        whyOpen: extractionWhyOpen.has(idea.id),
        showMention: true,
      });
    })
    .join("");
  return `
    <div class="chat-turn chat-turn--ai chat-turn--extraction">
      ${renderNotice({
        variant: "mermaid",
        label: `Extracted ${count} idea${count === 1 ? "" : "s"}`,
        open: message.open !== false,
        loading: message.status === "loading",
        bodyHtml: `
          <div class="extraction-turn__detail">
            <div class="extraction-turn__analyzed-row">
              <strong>Analyzed</strong>
              <span>${message.filename}</span>
            </div>
            ${cards}
          </div>
        `,
      })}
    </div>
  `;
}

// Resolve an extraction-turn idea by id (library first, then any extraction
// turn in the thread) so the card handlers can read its title / data.
function findExtractionIdea(sessionId, ideaId) {
  const fromLib = getIdeas(sessionId).find((i) => i.id === ideaId);
  if (fromLib) return fromLib;
  for (const m of getThread(sessionId)) {
    if (m.variant === "extraction" && Array.isArray(m.ideas)) {
      const hit = m.ideas.find((i) => i.id === ideaId);
      if (hit) return hit;
    }
  }
  return null;
}

// Re-render a single extraction-turn idea card in place (after a feedback / Why
// toggle) so the rest of the thread + scroll position stay put.
function repaintExtractionCard(root, session, ideaId) {
  const idea = findExtractionIdea(session.id, ideaId);
  const article = root.querySelector(`.extraction-turn__detail [data-idea-id="${ideaId}"]`);
  if (!idea || !article) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = renderCompactIdeaCard(idea, getStreamSources(session.id), {
    verdict: extractionVerdict.get(ideaId) || null,
    whyOpen: extractionWhyOpen.has(ideaId),
    showMention: true,
  });
  const fresh = tmp.firstElementChild;
  if (fresh) article.replaceWith(fresh);
}

// Drag-and-drop a file anywhere on the assistant panel → kicks off the
// upload pipeline directly (no modal). Matches the handoff "drop a file
// anywhere to add it as a source" hint shown under the composer. Files
// that don't classify (wrong extension, too big) fall back to the Add
// Source modal so the user gets the explicit error UX.
//
// Called from wireAssistantPanel on first mount AND from
// refreshAssistantAside after each wholesale swap of the
// `.session__assistant` element (FIND-A).
function bindDragAndDrop(aside, session) {
  if (!aside) return;
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
    // Clip Studio upload stage — route the dropped video into the studio flow
    // instead of the normal source intake (no "what to do with this video?").
    if (clipStudio.isActive(session.id) && clipStudio.getState(session.id)?.stage === "upload") {
      if (files[0]) handleClipStudioFile(session, files[0]);
      return;
    }
    // Batch Studio upload screen — stage dropped files (multi) instead of the
    // normal in-session source intake.
    if (batchStudio.isActive(session.id)) {
      handleBatchFiles(session, files);
      return;
    }
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

  // Arm the "taking longer than expected" watchdog for any loading turn carried
  // over from a prior render. The composer status bar itself is painted
  // declaratively by renderComposerStatus on each render, so no imperative sync
  // is needed here.
  updateLoadingWatchdog(session.id);

  // Composer mentions — the floating status card pushes source mentions
  // here via the composer-mentions store. Render once on mount, then
  // re-render on store updates (per-session subscription).
  const mentionsContainer = root.querySelector("[data-composer-mentions]");
  renderComposerMentions(mentionsContainer, session.id);
  const unsubMentions = subscribeComposerMentions(session.id, () => {
    renderComposerMentions(root.querySelector("[data-composer-mentions]"), session.id);
  });

  // Composer connector chip — "Ask a connector" attaches the connector here;
  // render once on mount, then re-render (and focus) when the active connector
  // changes. The submit handler routes the next message to it.
  renderComposerConnector(root, session.id);
  const unsubConnector = subscribeComposerConnector(session.id, () => {
    renderComposerConnector(root, session.id, { focus: true });
  });

  // Subscribe to the assistant thread.
  // When a NEW draft message lands we auto-open the right panel in Drafts
  // mode pinned to that batch — matches the handoff App.jsx "if the reply
  // has a batch, set activeBatchRef and switch to drafts" rule (§ State
  // Management → send transitions).
  //
  // Seed from the existing latest draft so a fresh renderSession (e.g. after
  // a panel-driven URL change) doesn't treat the seeded "drafts ready" turn
  // as new and re-trigger openDraftsPanel → URL write → re-render → loop.
  const seededLatestDraft = [...getThread(session.id)].reverse().find((m) => m.variant === "draft");
  let lastDraftMessageId = seededLatestDraft?.id || null;
  const seededLatestExtraction = [...getThread(session.id)].reverse().find((m) => m.variant === "extraction");
  let lastExtractionMessageId = seededLatestExtraction?.id || null;
  // Track whether we've already crossed the empty → started boundary (see
  // isThreadStarted). The first time we cross it the layout changes shape — the
  // empty hero (with its inline composer) gives way to the thread + a bottom
  // composer — so we must re-render the whole aside, not just repaint the thread
  // in place (which would drop the composer). Covers a first user message AND a
  // source landing (Batch-from-a-source / Add-source on a fresh chat).
  let threadStartedSeen = isThreadStarted(getThread(session.id));
  // Reconcile the single composer status slot (grey in-progress / green ready /
  // none) against the live state, reusing the enter/exit animations. The
  // data-status-key makes per-tick updates cheap and jank-free: same key → no-op
  // (source/clip tickers advance without re-animating); same variant, changed
  // text → in-place update; variant swap (grey↔green) → in-place markup swap, no
  // re-collapse; appear/disappear → animate in/out.
  const syncComposerStatus = () => {
    const inner = root.querySelector(".session__composer-inner");
    if (!inner) return;
    const existing = inner.querySelector(".session__composer-status");
    const status = computeComposerStatus(session.id);
    if (!status) {
      // Re-sync once the exit completes: if a new state became desired while the
      // bar was leaving (e.g. drafts land just as "Thinking…" clears), this
      // re-inserts it — covering the grey→green handoff across two notifies.
      if (existing && !existing.classList.contains("is-leaving")) {
        animateBannerOut(existing, () => syncComposerStatus());
      }
      return;
    }
    if (existing && !existing.classList.contains("is-leaving")) {
      if (existing.dataset.statusKey === status.key) return; // unchanged → no-op
      if (existing.dataset.statusShape === status.shape) {
        // Same shape, new text — update in place, no re-entrance.
        if (status.shape === "drafts") {
          const flow = existing.querySelector(".flow");
          if (flow) flow.innerHTML = draftBannerFlowInner(status.count);
        } else if (status.shape === "ideas") {
          const flow = existing.querySelector(".flow");
          if (flow) flow.innerHTML = ideaBannerFlowInner(status.count);
        } else {
          const label = existing.querySelector("[data-status-label]");
          if (label) label.textContent = status.label;
        }
        existing.dataset.statusKey = status.key;
        return;
      }
      // Shape swap (grey↔drafts↔ideas): replace markup in place, stay visible.
      existing.outerHTML = renderComposerStatus(session.id);
      return;
    }
    if (existing) return; // mid-exit; let it finish (a later tick re-inserts)
    const card = inner.querySelector(".session__composer-card");
    if (!card) return;
    card.insertAdjacentHTML("beforebegin", renderComposerStatus(session.id));
    animateBannerIn(inner.querySelector(".session__composer-status"));
  };
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
    updateLoadingWatchdog(session.id);
    // In Clip Studio's clips stage the composer is already locked
    // (selectable=false) and a full aside re-render would rebuild the clip
    // grid + thread, fighting this subscription's in-place thread repaint.
    // Skip the first-start refresh there.
    if (!threadStartedSeen && isThreadStarted(messages)) {
      threadStartedSeen = true;
      if (!clipStudio.isActive(session.id)) refreshAssistantAside();
    }
    const latestDraft = [...messages].reverse().find((m) => m.variant === "draft");
    if (latestDraft && latestDraft.id !== lastDraftMessageId) {
      lastDraftMessageId = latestDraft.id;
      // Drafts ready — notify without hijacking the conversation or forcing the
      // panel open. A toast (auto-dismiss) + the persistent topbar Drafts count
      // do the announcing; "Review" opens the panel pinned to this batch.
      const n = latestDraft.count ?? (latestDraft.drafts ? latestDraft.drafts.length : 0);
      if (isFlagOn("statusActionSnackbars")) {
        showToast(`${n} draft${n === 1 ? "" : "s"} ready to review`, {
          action: {
            label: "Review",
            onClick: () => openDraftsPanel({ sessionId: session.id, messageId: latestDraft.id }),
          },
        });
      }
      // Second, persistent surface (until reviewed): the green DS status bar.
      // Skip it if the user is already in the Drafts panel. The actual bar
      // reconcile happens once below — after draftBanners is set — so a grey
      // in-progress bar swaps straight to green (no flicker).
      if (getRightPanelMode() !== "drafts") {
        draftBanners.set(session.id, { batchId: latestDraft.id, count: n, at: Date.now() });
      }
    }
    // Ideas extracted — mirror the drafts bar: a persistent green "N ideas
    // ready" bar (until the Ideas panel is opened), in addition to the
    // "N ideas ready" snackbar fired centrally by postExtractionResult.
    const latestExtraction = [...messages].reverse().find((m) => m.variant === "extraction");
    if (latestExtraction && latestExtraction.id !== lastExtractionMessageId) {
      lastExtractionMessageId = latestExtraction.id;
      const n = latestExtraction.count ?? (latestExtraction.ideas ? latestExtraction.ideas.length : 0);
      if (getRightPanelMode() !== "ideas") {
        ideaBanners.set(session.id, { count: n, at: Date.now() });
      }
    }
    // Reconcile the composer status bar against the new thread state (grey
    // in-progress / green ready / none) — once per thread change.
    syncComposerStatus();
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
    // Drafts panel opened some other way (e.g. topbar pill) while the green bar
    // is up → the batch is being reviewed; drop it and reconcile (the bar exits,
    // or flips to grey if background work is still running). The bar's own Review
    // deletes the entry first, so this is a no-op for that path.
    if (getRightPanelMode() === "drafts" && draftBanners.has(session.id)) {
      draftBanners.delete(session.id);
      syncComposerStatus();
    }
    // Same lifecycle for the ideas bar — opening the Ideas panel clears it.
    if (getRightPanelMode() === "ideas" && ideaBanners.has(session.id)) {
      ideaBanners.delete(session.id);
      syncComposerStatus();
    }
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
    rebindWizardKeyboard(root.querySelector(".session__assistant"), session.id);
  };
  const refreshAssistantAside = () => {
    const aside = root.querySelector(".session__assistant");
    const screen = aside?.parentElement;
    if (screen) {
      // Recompute the attached playbook from the live state so a pill the
      // user picked (which set session.contextId) survives the empty→active
      // re-render — not the stale value captured when the panel first mounted.
      const liveQ = readQuery();
      const liveCtx = liveQ.contextId
        ? getContextById(liveQ.contextId)
        : session.contextId
          ? getContextById(session.contextId)
          : attachedContext;
      const fresh = renderAssistantPanel(session, liveCtx);
      const tmp = document.createElement("div");
      tmp.innerHTML = fresh;
      const newAside = tmp.firstElementChild;
      if (newAside && aside) {
        screen.replaceChild(newAside, aside);
      }
    }
    rebindWizardKeyboardIfActive();
    // The previous aside was swapped wholesale — re-bind drag/drop on the
    // fresh element. Without this, dropping a file after any wizard
    // refresh became a silent no-op (FIND-A).
    bindDragAndDrop(root.querySelector(".session__assistant"), session);
    // Wizard chat (inline-question / sidebar-wizard layouts) renders the
    // full thread above the picker — keep it pinned to the bottom on every
    // re-render so newly posted turns stay in view. Uses queueMicrotask so
    // it runs after the DOM swap above has committed.
    queueMicrotask(() => {
      const wizardChat = root.querySelector("#inlineQuestionChat, .session__assistant-wizard-chat");
      if (wizardChat) wizardChat.scrollTop = wizardChat.scrollHeight;
    });
  };
  // Top-posts board — a filter/sort/selection change only needs the board grid
  // repainted, so swap just the `.top-posts-board` subtree in place. Re-rendering
  // the whole aside (like the wizard subscription) would re-mount the intro +
  // workflow-flow steps and replay their entrance animation on every checkbox
  // toggle. Falls back to a full refresh on first open (board not mounted yet)
  // and when the picker closes (→ swap to the thread).
  const refreshTopPostsBoard = () => {
    const board = root.querySelector(".top-posts-board");
    const state = topPostsFlow.getPickerState(session.id);
    // Only a board-internal change (sort/period/selection) swaps in place; a
    // stage change (→ profile chooser / loading) re-renders the whole screen.
    if (!board || !state || state.stage !== "board") {
      refreshAssistantAside();
      return;
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = renderTopPostsBoard({
      posts: state.posts,
      sort: state.sort,
      profile: state.profile,
      period: state.period,
    });
    const fresh = tmp.firstElementChild;
    if (fresh) board.replaceWith(fresh);
  };
  const offWizard = sidebarWizard.subscribe(session.id, refreshAssistantAside);
  const offInlineQuestion = inlineQuestion.subscribe(session.id, refreshAssistantAside);
  const offTopPosts = topPostsFlow.subscribePicker(session.id, refreshTopPostsBoard);
  // Clip Studio — every stage transition + analyzing ticker tick re-renders the
  // whole assistant aside (mirrors the wizard subscription).
  const offClipStudio = clipStudio.subscribe(session.id, () => {
    // Analysis finished ("done") → hand the generated clips straight to the
    // conversational chat: no review grid, no profiles screen. clipsToChat
    // exits the studio, so this branch won't re-fire for the same session.
    if (clipStudio.isActive(session.id) && clipStudio.getState(session.id)?.stage === "done") {
      clipsToChat(session);
      return;
    }
    refreshAssistantAside();
  });
  // Batch Studio — re-render the aside on every staged-source / Playbook change.
  // Batch Studio — staging changes repaint only the list + commit (the intake
  // card stays put so the field isn't clobbered mid-typing). start/exit
  // transitions (no [data-batch-rest] yet) fall back to a full aside re-render.
  const offBatchStudio = batchStudio.subscribe(session.id, () => {
    if (root.querySelector("[data-batch-rest]")) repaintBatchRest(root, session);
    else refreshAssistantAside();
  });
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

  // Intake-turn lifecycle (loading → ready) — see intake-lifecycle.js.
  const offComposerSources = startIntakeLifecycle(session.id, {
    onSourcesChange: () => {
      repaintThreadFromSources();
      // Drive the grey "Analyzing …" composer bar as sources enter/leave the
      // Processing state (keyed reconcile → no churn on per-tick progress).
      syncComposerStatus();
    },
    // Clip Studio owns its own video source + UI — never pop the generic
    // "what to do with this video?" intake choice for a studio session.
    onVideoReady: (sourceId, filename) => {
      if (clipStudio.isActive(session.id)) return;
      askVideoIntake(session.id, sourceId, filename);
    },
    // A non-video source extracts its ideas during processing — surface the
    // persistent green "N ideas ready" bar (in addition to the source's
    // completion snackbar), same as the flow-based extractions.
    onSourceReady: (sourceId, src) => {
      const n = src.ideaCount || 0;
      if (n > 0 && getRightPanelMode() !== "ideas") {
        ideaBanners.set(session.id, { count: n, at: Date.now() });
        syncComposerStatus();
      }
    },
  });

  // Uploads → no extra wiring needed: startFileUpload already takes a
  // session.id, so the resulting source lands in this session's list
  // and the source subscription above handles intake + ready flips.
  const offComposerUploads = subscribeUploads(() => {});

  // Batch Studio hand-off — a "Start drafting" press on the batch screen minted
  // this chat and stashed the staged sources in batch-studio's in-memory slot.
  // Replay them now (after the intake lifecycle's baseline is set) so each runs
  // the classic source → idea-extraction workflow in this fresh conversation.
  const pendingBatch = batchStudio.consumePending();
  if (pendingBatch?.sources?.length) {
    setTimeout(() => replayBatchSources(session.id, pendingBatch), 50);
  }

  // Apply idea focus on initial render if ?focusIdea= is present.
  applyIdeaFocus(root);

  // Check for a pending draft intent set by the dashboard handler — start the
  // conversational flow after subscriptions are active so thread updates show.
  const pendingIdeaId = consumeHandoff("pendingDraftIdeaId");
  if (pendingIdeaId) {
    setTimeout(() => startIdeaDraft(session.id, pendingIdeaId), 100);
  }

  // Hand-off from a source card's "Ask" button on the dashboard or another
  // session — open the askWhatToKnow inline question in this freshly mounted
  // chat.
  const pendingAsk = consumeHandoff("pendingAskSource");
  if (pendingAsk?.filename) {
    setTimeout(() => askWhatToKnow(session.id, pendingAsk.filename, pendingAsk.sourceId), 150);
  }

  // Hand-off from the Connectors gallery's (or right-panel's) "Try in chat" /
  // "Ask" on a connected connector — launch the live-connector ask flow.
  const pendingAskConnector = consumeHandoff("pendingAskConnector");
  if (pendingAskConnector?.connectorId) {
    setTimeout(() => askConnector(session.id, pendingAskConnector.connectorId), 200);
  }

  // Hand-off from a topic card or the topic dialog's "Start a chat" — echo the
  // topic, attach it as a source, and open on Archie's read of it.
  const pendingTopic = consumeHandoff(TOPIC_CHAT_HANDOFF);
  if (pendingTopic?.topicId) {
    setTimeout(() => startTopicChat(session.id, pendingTopic.topicId), 150);
  }

  // Hand-off from a Content Ideas topic — the new-chat starter card or the
  // composer's Pick-a-topic modal. Attach only: unlike /topics this posts no
  // echo and no question picker, because the source-intake card already names
  // the topic and the composer is right there.
  // Same 150ms as the brief handoff below, and for the same reason: the thread
  // has to exist before a source-intake turn can be posted into it.
  const pendingPillar = consumeHandoff(PILLAR_CHAT_HANDOFF);
  if (pendingPillar && pendingPillar.pillarId) {
    setTimeout(() => attachPillarToChat(session.id, pendingPillar.ctxId, pendingPillar.pillarId), 150);
  }

  const pendingBrief = consumeHandoff(BRIEF_CHAT_HANDOFF);
  if (pendingBrief?.briefId) {
    setTimeout(() => attachBriefToChat(session.id, pendingBrief.briefId, pendingBrief.versionId || null), 150);
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
  //
  // The First Time User ALT flow uses the same handoff with two extra
  // payload fields: `prefill` (seeds selectedProfileId + connectedSocials
  // so askSocial can pre-check the platform) and `finishMode:
  // "switch-to-returning"` (flip the admin mode to returning before
  // navigating, so the dashboard renders the populated returning-user
  // state rather than redirecting back to /welcome-alt).
  const pendingCtxBuilder = consumeHandoff("pendingStartContextBuilder");
  if (pendingCtxBuilder) {
    const { returnTo, finishMode, prefilledUrl } = pendingCtxBuilder;
    const onComplete = () => {
      if (finishMode === "switch-to-returning") {
        try {
          window.localStorage.removeItem("archie-user-mode");
        } catch {
          /* ignore */
        }
        // Full reload so all stores re-seed with the returning-user
        // mocks (sessions, contexts, sources, etc.) and the admin
        // chip re-renders with the new "Returning user" label. The
        // hash change positions the landing target; the reload
        // commits the new mode across the whole app.
        if (returnTo) window.location.hash = "#" + returnTo;
        window.location.reload();
        return;
      }
      if (returnTo) navigate(returnTo);
    };
    setTimeout(() => {
      // Conversational 3-question orchestration (URL → profiles → optional
      // documents). Runs full-bleed for first-time onboarding, or integrated
      // in the app shell for a New Playbook (driven by welcomeAltIntegrated).
      contextBuilder.startAlt(session.id, { onComplete, prefilledUrl });
    }, 50);
  }

  bindDragAndDrop(root.querySelector(".session__assistant"), session);

  currentUnsubscribe = () => {
    offThread();
    offRightPanel();
    offLibrary();
    offPosts();
    offWizard();
    offInlineQuestion();
    offTopPosts();
    offClipStudio();
    offBatchStudio();
    offComposerSources();
    offComposerUploads();
    unsubMentions();
    unsubConnector();
    stopThinkingTimer();
    // NOTE: we deliberately do NOT clipStudio.exit() here. The router re-runs
    // this cleanup on every hashchange (including query-only changes within the
    // same session), so exiting would wipe the flow on, e.g., a Drafts-panel URL
    // write. State persists per session id instead; if the user truly navigates
    // away mid-analyzing, the ticker self-completes and notifies a now-empty
    // subscriber set (harmless no-op).
  };
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
    sessionId: session.id,
  });
}

// Channel-picker choice turn — chips toggle on click, "Draft them" submits.
// Network → icon mapping — used both in the Drafts summary card network row
// and (later) by the Drafts work-surface in Lot 4. Keep the slug list aligned
// with mocks.socialAccounts so the visual surfaces never miss a network.
const NETWORK_ICON = {
  linkedin: "ap-icon-linkedin-official",
  twitter: "ap-icon-twitter-official",
  x: "ap-icon-twitter-official",
  instagram: "ap-icon-instagram-official",
  facebook: "ap-icon-facebook-official",
  tiktok: "ap-icon-tiktok-official",
  youtube: "ap-icon-youtube-official",
};

function networkLabel(network) {
  if (network === "twitter") return "X";
  if (!network) return "";
  return network.charAt(0).toUpperCase() + network.slice(1);
}

// Pending → ready clip-extraction card. The turn carries only the sourceId
// and filename; the renderer reads the live source from sources-stream so
// the same turn naturally flips state when setClipExtractionStatus fires
// (the session view subscribes to subscribeSources, repainting the thread).
function renderClipExtractionTurn(message, sessionId) {
  const source = getStreamSources(sessionId).find((s) => s.id === message.sourceId);
  const filename = escapeHtml(source?.filename || message.filename || "your video");

  // Source was removed (e.g. user deleted it from /sources) — degrade to a
  // muted "unavailable" card rather than leave a broken CTA.
  if (!source) {
    return `
      <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
        ${renderResultCard({
          state: "unavailable",
          icon: "ap-icon-file--video",
          title: "Clips no longer available",
          sub: `${filename} was removed.`,
        })}
      </div>
    `;
  }

  const clipsCount = Array.isArray(source.clips) ? source.clips.length : 0;
  const isReady = source.clipExtractionStatus === "ready" || clipsCount > 0;

  if (!isReady) {
    // Live stage label from the extraction ticker (sources-stream); falls back
    // to a generic line before the first tick lands.
    const stage = source.clipStage || "Cutting your clips";
    return `
      <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
        ${renderResultCard({
          state: "pending",
          busyLabel: stage,
          title: `${stage}…`,
          sub: "Turning your video into post-ready clips — this takes a moment. You can keep chatting.",
        })}
      </div>
    `;
  }

  const titleLabel = clipsCount === 1 ? "1 clip to review" : `${clipsCount} clips to review`;
  return `
    <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
      ${renderResultCard({
        state: "ready",
        title: titleLabel,
        sub: `From <span class="drafts-card__sub-quote">${filename}</span>`,
        cta: { label: "Open clips" },
        dataAttr: `data-clip-card-open="${source.id}"`,
      })}
    </div>
  `;
}

// Pending → ready idea-extraction notice for the "Extract themes" branch.
// Uses the shared renderResultCard so "ideas ready", "clips ready" and
// "drafts to review" all read as one result-card family.
function renderIdeaExtractionTurn(message, sessionId) {
  const source = getStreamSources(sessionId).find((s) => s.id === message.sourceId);
  const filename = escapeHtml(source?.filename || message.filename || "your video");

  if (message.status === "loading") {
    return `
      <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
        ${renderResultCard({
          state: "pending",
          busyLabel: "Reading video for ideas",
          title: "Reading the video for ideas…",
          sub: "About 15s. You can keep chatting.",
        })}
      </div>
    `;
  }

  // Source removed before the user opened the ready card — degrade rather
  // than crash on source.id.
  if (!source) {
    return `
      <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
        ${renderResultCard({
          state: "unavailable",
          icon: "ap-icon-file--video",
          title: "Ideas no longer available",
          sub: `${filename} was removed.`,
        })}
      </div>
    `;
  }

  return `
    <div class="chat-turn chat-turn--ai chat-turn--clip-extraction">
      ${renderResultCard({
        state: "ready",
        title: "Ideas ready",
        sub: `From <span class="drafts-card__sub-quote">${filename}</span>`,
        cta: { label: "View ideas" },
        dataAttr: `data-ideas-card-open="${source.id}"`,
      })}
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

const SCRIPTED_KINDS = {
  pdf: { kindLabel: "PDF", filename: "Roadmap Q3.pdf" },
  video: { kindLabel: "Video", filename: "Demo replay.mp4" },
  url: { kindLabel: "URL", filename: "blog.example.com/post" },
};

function startPillFromKind(_root, session, kind) {
  const spec = SCRIPTED_KINDS[kind];
  if (!spec) return;
  const sessionId = session.id;
  // Uniform pipeline: push a Processing source, then flip it Processed
  // after ~6s. Clips for Video sources are attached automatically by
  // completeScriptedSource (see sources-stream.attachVideoClips). The
  // chat stays interactive throughout — no follow-up picker, the user
  // can keep typing and only sees the intake bubble + completion toast.
  const sourceId = pushScriptedSource({ filename: spec.filename, kind: spec.kindLabel, sessionId });
  const ideaCount = 3 + Math.floor(Math.random() * 6);
  setTimeout(() => {
    completeScriptedSource(sourceId, {
      signal: "Medium signal",
      signalColor: "tagOrange",
      ideaCount,
    });
  }, 6000);
}

// Clip Studio — upload-stage entry points. Picking a file / dropping / pasting a
// URL starts the upload + analysis in the BACKGROUND right away, but the config
// screen stays visible/editable. The user proceeds to the clips by pressing
// "Create clips" (see the data-clip-create handler).
function handleClipStudioFile(session, file) {
  const classification = classifyFile(file);
  if (!classification.ok) {
    showToast(classification.reason);
    return;
  }
  beginClipStudioBackground(session, file.name);
}

function handleClipStudioUrl(session, url) {
  beginClipStudioBackground(session, url.replace(/^https?:\/\//, "").replace(/\/$/, ""));
}

// ── Batch Studio helpers ──────────────────────────────────────────────────────
// Stage every accepted file; toast (once) when some are rejected.
function handleBatchFiles(session, fileList) {
  const rejected = [];
  for (const file of Array.from(fileList)) {
    const classification = classifyFile(file);
    if (!classification.ok) {
      rejected.push(file.name);
      continue;
    }
    batchStudio.addFileSource(session.id, file, classification);
  }
  if (rejected.length) {
    showToast(
      rejected.length === 1 ? `Unsupported file: ${rejected[0]}` : `${rejected.length} files skipped (unsupported)`,
    );
  }
}

// Targeted repaint of the staged list + Playbook + CTA, leaving the upload box
// (and the connector popover) untouched. Used by the batchStudio subscription so
// staging-loader ticks don't tear down the whole intake.
function repaintBatchRest(root, session) {
  const rest = root.querySelector("[data-batch-rest]");
  if (rest) rest.innerHTML = renderBatchRest(session);
}

// "Start drafting" — mint a fresh chat bound to the chosen Playbook, stash the
// staged sources for it to replay on mount (the classic source → idea workflow),
// then leave the batch screen. Files can't ride a sessionStorage handoff, so the
// payload travels in batch-studio's in-memory pendingBatch slot.
function startBatchChat(session) {
  const st = batchStudio.getState(session.id);
  if (!st || !st.sources.length) return;
  const contextId = st.contextId || getDefaultContext()?.id || "";
  if (!batchStudio.stashPending(session.id)) return;
  batchStudio.exit(session.id);
  const newId = `new-${Date.now().toString(36)}`;
  const path = `/session/${newId}`;
  if (contextId) setHashQuery(path, { contextId });
  else navigate(path);
}

// Replay batch-staged sources into the freshly mounted chat so each runs the
// classic intake (loading → ready → ideas). Sources must be added AFTER mount —
// the intake-lifecycle only posts intake turns for ids appearing past its
// baseline snapshot. URLs/connectors process on their own timers; files run the
// upload→processing pipeline.
function replayBatchSources(sessionId, batch) {
  for (const src of batch.sources) {
    if (src.origin === "file" && src.file && src.classification) {
      startFileUpload(src.file, src.classification, sessionId);
    } else if (src.origin === "url" && src.url) {
      startUrlImport(src.url, sessionId);
    } else if (src.origin === "text" && src.text) {
      startTextImport(src.text, sessionId);
    } else if (src.origin === "connector" && src.connector && src.doc) {
      startConnectorImport(src.connector, src.doc, sessionId);
    }
  }
}

// Create a REAL sources-stream video source (so the trimmer modal, right-panel
// Clips/Drafts and draft creation all share one source) and kick off the
// background analysis. pushScriptedSource + completeScriptedSource don't fire
// the intake-lifecycle "what to do?" choice (that only triggers via
// startFileUpload); the onVideoReady guard in bindSession also skips it while
// the studio is active.
function beginClipStudioBackground(session, sourceName) {
  const name = sourceName || "your video";
  const sourceId = pushScriptedSource({ filename: name, kind: "Video", sessionId: session.id });
  completeScriptedSource(sourceId, { signal: "Medium signal", signalColor: "tagOrange", ideaCount: 0 });
  clipStudio.beginProcessing(session.id, { sourceName: name, sourceId });
}

// Open a clip in the trimmer modal (edit/recut) or add a new clip, both
// persisting back to the studio's real source via updateSourceClips.
function openClipStudioEditor(session, opts) {
  const src = clipStudio.currentSource(session.id);
  if (!src) return;
  openVideoClipsModal(src, {
    ...opts,
    onSaveClips: (sourceId, clips) => {
      updateSourceClips(sourceId, clips);
      clipStudio.refresh(session.id);
    },
  });
}

// Finalize — batch-create drafts for every selected clip × selected profile,
// then leave the studio and land on the conversational session with the
// classic Drafts panel open.
// Hand the freshly generated clips off to the conversational chat. Skips the
// full-page review grid + profiles screens entirely: the clips are already
// cut and attached to the source, so we post a short Archie intro + the
// standard "Clips ready" card (its "Open clips" CTA opens the right-panel
// Clips surface) and exit the studio, dropping the user into the normal chat.
function clipsToChat(session) {
  const st = clipStudio.getState(session.id);
  if (!st) return;
  const clips = clipStudio.getClips(session.id) || [];
  const sourceId = st.sourceId;
  const sourceName = st.sourceName || "your video";
  const n = clips.length;
  postAssistantMessage(
    session.id,
    `I cut ${n} ${n === 1 ? "clip" : "clips"} from ${sourceName}. Open them to review and trim, then draft the ones you want to post.`,
  );
  postClipExtractionTurn(session.id, { sourceId, filename: sourceName });
  // Leave the studio last — the session now renders as a normal chat with the
  // turns above already in the thread.
  clipStudio.exit(session.id);
}

function finalizeClipStudio(session) {
  const st = clipStudio.getState(session.id);
  if (!st) return;
  const clips = clipStudio.getClips(session.id).filter((c) => (st.selectedClipIds || []).includes(c.id));
  const profileIds = st.profileSelection || [];
  const accounts = getConnectedProfiles().filter((p) => profileIds.includes(p.id));
  if (!clips.length || !accounts.length) return;
  const sourceName = st.sourceName || "your video";
  const captionStyle = st.config?.captionStyle === "none" ? null : st.config?.captionStyle || null;
  const perNet = st.perNetworkFormat || {};
  clipStudio.exit(session.id);
  const pendingId = startPending(session.id, "Generating drafts");
  setTimeout(() => {
    finishPending(session.id, pendingId);
    const drafts = [];
    for (const clip of clips) {
      for (const a of accounts) {
        const d = addPostDraft(session.id, {
          network: a.platform,
          text: [clip.title, clip.summary].filter(Boolean),
          hashtags: (clip.tags || []).map((t) => `#${t}`),
          clipRef: { start: clip.start, end: clip.end, sourceName, hue: clip.hue },
          format: perNet[a.platform] || st.config?.format || clip.format || "9:16",
          subtitleStyle: captionStyle,
        });
        d.generationContext = clipContext(clip, sourceName);
        drafts.push(d);
      }
    }
    postDraftResult(session.id, { ideaTitle: `Clips from ${sourceName}`, drafts });
  }, 1600);
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
    // A connected connector attached to the composer routes the message to the
    // live source (simulated MCP) instead of the normal assistant thread, then
    // detaches itself so the next message is a normal follow-up.
    const activeConnector = getActiveConnector(session.id);
    if (activeConnector) {
      sendConnectorMessage(session.id, activeConnector, text);
      clearActiveConnector(session.id);
    } else {
      sendMessage(session.id, text);
    }
    input.value = "";
    // Snap the textarea back to its CSS min-height — without this it
    // keeps the autosized height from the last message.
    autosizeInput(input);
  }

  // Grow the textarea with content. CSS provides min-height (2 lines)
  // and max-height (clamped so the chrome doesn't get pushed off-
  // screen on a long paste); we just keep the height pinned to the
  // current content's scrollHeight.
  function autosizeInput(input) {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  }

  // Run the handler for a choice turn (freeze the message + dispatch). Called
  // by both the Submit-button path and the instant chip-click path.
  function dispatchChoiceSubmit(msg, selectedValues) {
    submitAssistantChoice(session.id, msg.id, selectedValues);
    if (msg.handler === "draft-channels" && msg.context?.ideaId) {
      executeDraft(
        session.id,
        msg.context.ideaId,
        selectedValues,
        1,
        msg.context.angle || null,
        msg.context.language || null,
      );
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
        const count = draftIds.length;
        const clipWord = count === 1 ? "clip" : "clips";
        const message =
          pick === "none"
            ? `Subtitles removed from ${count} ${clipWord}`
            : `${label} subtitles added to ${count} ${clipWord}`;
        showToast(message, { duration: 3200 });
      }
    }
  }

  root.addEventListener(
    "click",
    (event) => {
      // Shared "how's this?" feedback control — wires the clip thumbs/reasons
      // rendered in the Clip Studio review grid (renderClipCard). Handled first
      // so the in-place thumb/chip/Send updates bail before other handlers.
      if (onFeedbackClick(event)) return;
      // Extraction-turn idea cards use the shared compact idea card
      // (renderCompactIdeaCard) — wire its data-rpanel-* hooks to chat-context
      // actions. Scoped to .extraction-turn__detail so they never collide with
      // the right-panel's own delegation. Each toggle repaints just that card.
      const ideaWhy = event.target.closest(".extraction-turn__detail [data-rpanel-idea-why-toggle]");
      if (ideaWhy) {
        event.preventDefault();
        const id = ideaWhy.dataset.rpanelIdeaWhyToggle;
        if (extractionWhyOpen.has(id)) extractionWhyOpen.delete(id);
        else extractionWhyOpen.add(id);
        repaintExtractionCard(root, session, id);
        return;
      }
      const ideaThumb = event.target.closest(".extraction-turn__detail [data-rpanel-ideas-feedback]");
      if (ideaThumb) {
        event.preventDefault();
        const id = ideaThumb.dataset.rpanelIdeasFeedback;
        const verdict = ideaThumb.dataset.verdict;
        if (extractionVerdict.get(id) === verdict) extractionVerdict.delete(id);
        else extractionVerdict.set(id, verdict);
        repaintExtractionCard(root, session, id);
        return;
      }
      const ideaMention = event.target.closest(".extraction-turn__detail [data-rpanel-mention-idea]");
      if (ideaMention) {
        const idea = findExtractionIdea(session.id, ideaMention.dataset.rpanelMentionIdea);
        if (idea) addComposerMention(session.id, idea.title);
        return;
      }
      const ideaUse = event.target.closest(".extraction-turn__detail [data-rpanel-use-idea]");
      if (ideaUse) {
        event.preventDefault();
        startIdeaDraft(session.id, ideaUse.dataset.rpanelUseIdea);
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
          // Keep the primary disabled until at least one row is selected.
          const submit = opts.querySelector("[data-wizard-answer-submit]");
          if (submit) submit.disabled = !opts.querySelector("[data-wizard-answer].is-selected");
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

      // Stepper mode — per-row −/+ adjusts that row's count (and selects it).
      const inlineQuestionStep = event.target.closest("[data-inline-question-step]");
      if (inlineQuestionStep) {
        event.preventDefault();
        const delta = inlineQuestionStep.dataset.inlineQuestionStep === "inc" ? 1 : -1;
        inlineQuestion.stepBump(session.id, inlineQuestionStep.dataset.stepValue, delta);
        return;
      }
      // Stepper mode — "Generate N drafts" submits the selected row + count.
      if (event.target.closest("[data-inline-question-generate]")) {
        event.preventDefault();
        inlineQuestion.stepSubmit(session.id);
        return;
      }
      // Counter-submit — the explicit "Generate N drafts" footer button that
      // commits an inline-counter row (e.g. the repurpose scope "Same profile").
      // Reuses pick(), which passes the counter row's current count to onPick.
      const counterSubmitBtn = event.target.closest("[data-inline-question-counter-submit]");
      if (counterSubmitBtn) {
        event.preventDefault();
        inlineQuestion.pick(session.id, counterSubmitBtn.dataset.inlineQuestionCounterSubmit);
        return;
      }

      // Inline single-question pick / skip / custom-submit / multi-submit.
      const inlineQuestionBtn = event.target.closest("[data-inline-question]");
      if (inlineQuestionBtn) {
        event.preventDefault();
        const opts = inlineQuestionBtn.closest(".analyse__options");
        // A counter row paired with a footer "Generate" button commits via that
        // button — its body click is inert (only the −/+ act, handled above).
        if (
          inlineQuestionBtn.classList.contains("analyse__option--counter") &&
          opts?.querySelector("[data-inline-question-counter-submit]")
        ) {
          return;
        }
        if (opts?.dataset.multi !== undefined) {
          const wasSelected = inlineQuestionBtn.classList.contains("is-selected");
          inlineQuestionBtn.classList.toggle("is-selected", !wasSelected);
          inlineQuestionBtn.setAttribute("aria-pressed", !wasSelected ? "true" : "false");
          // Keep the primary disabled until at least one row is selected.
          const submit = opts.querySelector("[data-inline-question-submit]");
          if (submit) submit.disabled = !opts.querySelector("[data-inline-question].is-selected");
        } else if (opts?.dataset.stepper !== undefined) {
          // Stepper mode — clicking a row selects it (the count drives the
          // generate button); it doesn't pick-and-advance.
          inlineQuestion.stepSelect(session.id, inlineQuestionBtn.dataset.inlineQuestion);
        } else if (opts?.dataset.single !== undefined) {
          // Single-select-with-confirm — highlight the row; a separate submit
          // (e.g. the top-posts "Next" button) confirms it.
          inlineQuestion.singleSelect(session.id, inlineQuestionBtn.dataset.inlineQuestion);
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
          // Keep the Submit disabled until at least one chip is selected.
          const bubble = choiceChip.closest(".chat-bubble");
          const submit = bubble?.querySelector("[data-assistant-choice-submit]");
          if (submit) submit.disabled = !bubble.querySelector("button.chat-bubble-choice-chip.is-selected");
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

      // Connect-prompt "Connect <service>" — connect the service through the
      // store (so every connectors surface stays in sync), then retry the
      // import that triggered the prompt. The turn collapses to a confirmation.
      const connectPromptBtn = event.target.closest("[data-connect-prompt-connect]");
      if (connectPromptBtn) {
        event.preventDefault();
        const msgId = connectPromptBtn.dataset.connectPromptConnect;
        const msg = getThread(session.id).find((m) => m.id === msgId);
        if (!msg) return;
        const conn = findConnector(msg.connectorId);
        if (conn) {
          setConnectorStatus(msg.connectorId, {
            status: "connected",
            account: conn.account || "matt@archie.io",
            lastSync: "just now",
          });
        }
        markConnectPromptResolved(session.id, msgId, "connected");
        startUrlImport(msg.url, session.id);
        showToast(`${msg.connectorName} connected — importing your ${msg.noun} now.`);
        return;
      }

      // Connect-prompt "Close" — dismiss without connecting (turn is hidden).
      const connectPromptDismiss = event.target.closest("[data-connect-prompt-dismiss]");
      if (connectPromptDismiss) {
        event.preventDefault();
        markConnectPromptResolved(session.id, connectPromptDismiss.dataset.connectPromptDismiss, "dismissed");
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
          startIdeaDraft(session.id, ideaId);
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

      // --- Context tab ---
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
      // setting `action` on the mock. The "open-video-clips" action opens the
      // dedicated Clip Studio in a fresh `clip-studio-*` session (upload →
      // analyzing → clips), mirroring the welcome-alt dedicated-session pattern.
      // ── The Content Ideas starter card ─────────────────────────────────
      // Flip: animate the current card out, swap the markup at the halfway
      // point, animate the next one in. The class is driven from JS rather than
      // :target/:checked because the content changes between the two halves —
      // there is no pure-CSS way to swap the card and keep both directions
      // animated. Reduced motion short-circuits to an instant swap.
      const flipBtn = event.target.closest("[data-starter-topic-flip]");
      if (flipBtn) {
        const slot = flipBtn.closest("[data-starter-topic-slot]");
        const stage = slot?.querySelector("[data-starter-topic-stage]");
        if (!stage) return;
        starterTopicIndex += 1;
        const swap = () => {
          // Re-check that the slot we captured on the click is still in the
          // document. It might not be: this runs 180ms later, and in between the
          // countdown's own swap can have replaced it, the hero can have
          // re-rendered, or a second click can have landed. Without the guard
          // `slot.parentElement` is null and replaceChild throws — reachable just
          // by clicking the shuffle button twice quickly. The countdown's swap
          // already had this check; the flip's didn't.
          const host = slot.parentElement;
          if (!host || !document.body.contains(slot)) return;
          const next = document.createElement("div");
          next.innerHTML = renderStarterTopicSlot();
          // Swap the slot in place inside the grid, so the workflow cells
          // around it keep their positions.
          const fresh = next.querySelector("[data-starter-topic-slot]");
          if (fresh) host.replaceChild(fresh, slot);
        };
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          swap();
          return;
        }
        stage.classList.add("is-leaving");
        window.setTimeout(() => {
          swap();
          const s = document.querySelector("[data-starter-topic-stage]");
          if (s) s.classList.add("is-entering");
        }, 180);
        return;
      }
      // Clicking the card itself drafts from that topic — the same handoff the
      // idea card's "Draft post" uses, so no new flow is introduced.
      const topicCard = event.target.closest("[data-starter-topic]");
      if (topicCard) {
        openBriefInChat(topicCard.dataset.starterTopic);
        return;
      }

      const starterBtn = event.target.closest("[data-starter]");
      if (starterBtn && starterBtn.dataset.starterAction === "open-video-clips") {
        setHandoff("pendingStartClipStudio", {});
        navigate(`/session/clip-studio-${Date.now().toString(36)}`);
        return;
      }
      // "Batch from a source" — open the dedicated Batch Studio intake screen in
      // a fresh `batch-*` session (upload 1+ sources + pick a Playbook → new chat).
      if (starterBtn && starterBtn.dataset.starterAction === "open-batch") {
        setHandoff("pendingStartBatch", {});
        navigate(`/session/batch-${Date.now().toString(36)}`);
        return;
      }
      // "Use top performing posts" — launch the milker flow inline in this
      // session (winner grid → pick a reuse mode → drafts). startTopPostsFlow
      // opens the grid screen (renderTopPostsPickerScreen below).
      if (starterBtn && starterBtn.dataset.starterAction === "open-top-posts") {
        topPostsFlow.startTopPostsFlow(session.id);
        return;
      }
      // (Step 1's profile chooser is the exact inline-question picker now — its
      // rows route through the shared [data-inline-question] delegate above,
      // in single-select mode: clicking highlights, "Next" confirms.)
      // Step 1 "Next" → confirm the highlighted account + Playbook and load its
      // winners (submitSingle resolves the picker → chooseProfile).
      if (event.target.closest("[data-topposts-next]")) {
        inlineQuestion.submitSingle(session.id);
        return;
      }
      // No-history empty studio → "Back to chat" leaves the picker (→ normal
      // chat). exitPicker notifies, so refreshTopPostsBoard repaints the aside.
      if (event.target.closest("[data-topposts-exit]")) {
        topPostsFlow.exitPicker(session.id);
        return;
      }
      // Inline widget — confirm the selection → freeze the widget, then hand off
      // to the shared profiles step (skip the duplicate echo, since the frozen
      // widget already shows the picks).
      if (event.target.closest("[data-topposts-widget-confirm]")) {
        const ids = answerTopPostsWidget(session.id);
        const valid = topPostsFlow.echoRepurposePicks(session.id, ids, { echo: false });
        if (valid.length) askRepurposeProfiles(session.id, valid);
        return;
      }
      // Step 1 Playbook picker → set the voice governing the repurposed drafts.
      const topPostsPlaybook = event.target.closest("[data-topposts-playbook-pick]");
      if (topPostsPlaybook) {
        topPostsFlow.setContext(session.id, topPostsPlaybook.dataset.toppostsPlaybookPick);
        root.querySelector("[data-topposts-playbook]")?.removeAttribute("open");
        return;
      }
      // Winner-board sort chip → re-sort the grid (checked before the card
      // pick since chips sit outside the cards).
      const topPostSort = event.target.closest("[data-top-post-sort]");
      if (topPostSort) {
        topPostsFlow.setSort(session.id, topPostSort.dataset.topPostSort);
        return;
      }
      // Winner-board period chip → narrow the grid to a recency window (checked
      // before the card pick since chips sit outside the cards).
      const topPostPeriod = event.target.closest("[data-top-post-period]");
      if (topPostPeriod) {
        topPostsFlow.setPeriod(session.id, topPostPeriod.dataset.topPostPeriod);
        return;
      }
      // Card "Repurpose" → repurpose that one winner (one post at a time).
      const topPostRepurpose = event.target.closest("[data-top-post-repurpose]");
      if (topPostRepurpose) {
        startRepurposeFlow(session.id, [topPostRepurpose.dataset.topPostRepurpose]);
        return;
      }

      // --- Batch Studio (dedicated source-intake screen) ---
      if (batchStudio.isActive(session.id)) {
        // Additional features — open the add-source modal (staged) for a link or
        // pasted text. Checked before the dropzone so a click on these buttons
        // (which sit inside the upload box) doesn't also open the file picker.
        // Staging callbacks shared across the modal's tabs — whichever tab the
        // user ends on (incl. switching to Upload), the source lands in the
        // batch's staged list instead of the global upload stream.
        const onStageFile = (file, classification) => batchStudio.addFileSource(session.id, file, classification);
        const onStageUrl = (url) => batchStudio.addUrlSource(session.id, url);
        const onStageText = (text) => batchStudio.addTextSource(session.id, text);
        if (event.target.closest("[data-batch-link]")) {
          openAddSourceModal({ tab: "url", onStageUrl, onStageText, onStageFile });
          return;
        }
        if (event.target.closest("[data-batch-paste]")) {
          openAddSourceModal({ tab: "pasteText", onStageUrl, onStageText, onStageFile });
          return;
        }
        // Click the upload box (or Browse) → OS file picker.
        if (event.target.closest("[data-batch-dropzone]")) {
          root.querySelector("[data-batch-file]")?.click();
          return;
        }
        // Remove a staged source (source-card staged-mode remove control).
        const rmBatch = event.target.closest("[data-source-remove]");
        if (rmBatch) {
          batchStudio.removeSource(session.id, rmBatch.dataset.sourceRemove);
          return;
        }
        // Pick the Playbook for the chat.
        const bPlaybook = event.target.closest("[data-batch-playbook-pick]");
        if (bPlaybook) {
          batchStudio.setContext(session.id, bPlaybook.dataset.batchPlaybookPick);
          root.querySelector("[data-batch-playbook]")?.removeAttribute("open");
          return;
        }
        // Stage a doc from a connected source (uses the connector's first doc).
        const bConn = event.target.closest("[data-batch-connector-pick]");
        if (bConn) {
          const connector = findConnector(bConn.dataset.batchConnectorPick);
          const docs = connectorDocs[connector?.id] || [];
          if (connector && docs[0]) batchStudio.addConnectorSource(session.id, connector, docs[0]);
          root.querySelector("[data-batch-connector]")?.removeAttribute("open");
          return;
        }
        // Start drafting → create a new chat bound to the chosen Playbook and
        // replay the staged sources through the classic intake on mount.
        if (event.target.closest("[data-batch-start]")) {
          startBatchChat(session);
          return;
        }
      }

      // --- Clip Studio (dedicated video-clips flow) ---
      if (clipStudio.isActive(session.id)) {
        // Upload stage: open the file picker from the dropzone or Browse button.
        if (event.target.closest("[data-clip-studio-browse]") || event.target.closest("[data-clip-studio-dropzone]")) {
          root.querySelector("[data-clip-studio-file]")?.click();
          return;
        }
        // Pick the Playbook governing the drafts' voice.
        const clipPb = event.target.closest("[data-clip-playbook-pick]");
        if (clipPb) {
          clipStudio.setContext(session.id, clipPb.dataset.clipPlaybookPick);
          root.querySelector("[data-clip-playbook]")?.removeAttribute("open");
          return;
        }
        // Config toggle controls (output-format cards + caption-style cards).
        const cfgBtn = event.target.closest("[data-clip-config][data-value]");
        if (cfgBtn) {
          clipStudio.setConfig(session.id, { [cfgBtn.dataset.clipConfig]: cfgBtn.dataset.value });
          // On the review step the format/caption controls re-bake the clips so
          // the trimmer + resulting drafts reflect the pick (config stays the
          // source of truth either way — see finalizeClipStudio).
          if (clipStudio.getState(session.id)?.stage === "clips") {
            clipStudio.applyConfigToClips(session.id);
          }
          return;
        }
        // "Surprise me" — prefill the instructions field with a canned hint.
        if (event.target.closest("[data-clip-surprise]")) {
          clipStudio.setConfig(session.id, {
            instructions: "Lead with the strongest hook, keep clips punchy, and skip the intro.",
          });
          return;
        }
        // "Create clips" → leave config for the clips grid (or the loader if the
        // background analysis is still running).
        if (event.target.closest("[data-clip-create]")) {
          clipStudio.createClips(session.id);
          return;
        }
        // Reused DS clip card → "Why this clip" collapsible (in-place toggle).
        const csWhy = event.target.closest("[data-rpanel-clip-why-toggle]");
        if (csWhy) {
          event.preventDefault();
          const section = csWhy.closest(".rpanel-ideas__why");
          if (section) {
            const next = section.getAttribute("data-why-open") !== "true";
            section.setAttribute("data-why-open", next ? "true" : "false");
            csWhy.setAttribute("aria-expanded", next ? "true" : "false");
            const body = document.getElementById(csWhy.getAttribute("aria-controls"));
            if (body) body.hidden = !next;
            const chev = csWhy.querySelector(".rpanel-ideas__why-chevron");
            if (chev) {
              chev.classList.toggle("ap-icon-chevron-down", !next);
              chev.classList.toggle("ap-icon-chevron-up", next);
            }
          }
          return;
        }
        // Clips review: edit/recut a clip, or add a new one (trimmer modal).
        // Reused DS clip card → Edit (thumb + kebab) opens the trimmer modal.
        const editClip = event.target.closest("[data-clip-edit]");
        if (editClip) {
          openClipStudioEditor(session, { editingClipId: editClip.dataset.clipEdit });
          return;
        }
        // Reused DS clip card → Remove (kebab) deletes the clip from the source.
        const rmClip = event.target.closest("[data-clip-remove]");
        if (rmClip) {
          const src = clipStudio.currentSource(session.id);
          if (src) {
            updateSourceClips(
              src.id,
              (src.clips || []).filter((c) => c.id !== rmClip.dataset.clipRemove),
            );
            clipStudio.refresh(session.id);
          }
          return;
        }
        if (event.target.closest("[data-clip-add-studio]")) {
          openClipStudioEditor(session, { startAddClip: true });
          return;
        }
        // Back to the config screen (from the extraction loader or clips review).
        if (event.target.closest("[data-clip-back-config]")) {
          clipStudio.backToConfig(session.id);
          return;
        }
        // Continue → seed the profiles step from the config (networks + their
        // chosen formats), then go to it.
        if (event.target.closest("[data-clip-continue]")) {
          const cur = clipStudio.getState(session.id);
          if (!cur.profileSelection) {
            clipStudio.setProfileSelection(
              session.id,
              getConnectedProfiles().map((p) => p.id),
            );
          }
          clipStudio.goToProfiles(session.id);
          return;
        }
        // Profiles step: back, per-network format override, finalize.
        if (event.target.closest("[data-clip-back]")) {
          clipStudio.backToClips(session.id);
          return;
        }
        const netFmt = event.target.closest("[data-clip-netfmt]");
        if (netFmt) {
          clipStudio.setNetworkFormat(session.id, netFmt.dataset.clipNetfmt, netFmt.dataset.value);
          return;
        }
        if (event.target.closest("[data-clip-finalize]")) {
          finalizeClipStudio(session);
          return;
        }
      }

      // Prompt-injection starters carry a `data-starter-prompt`. Coming-soon
      // teasers are non-interactive (no prompt, aria-disabled) — ignore clicks.
      if (starterBtn && starterBtn.dataset.starterPrompt != null) {
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

      // Draft-ready status bar "Review" → animate the bar out, THEN open the
      // Drafts panel pinned to the batch (opening writes the URL hash, which can
      // re-render the route — so we defer it until the exit animation finishes).
      if (event.target.closest("[data-draft-banner-review]")) {
        const ref = draftBanners.get(session.id)?.batchId;
        draftBanners.delete(session.id);
        const open = () => openDraftsPanel({ sessionId: session.id, messageId: ref });
        animateBannerOut(root.querySelector(".session__composer-status"), open);
        return;
      }

      // Ideas-ready bar "View ideas" → animate out, then open the Ideas panel.
      if (event.target.closest("[data-idea-banner-view]")) {
        ideaBanners.delete(session.id);
        animateBannerOut(root.querySelector(".session__composer-status"), () => openIdeasPanel());
        return;
      }

      // Detach the composer connector chip (×) — the next message goes back to
      // the normal assistant thread.
      if (event.target.closest("[data-composer-connector-remove]")) {
        clearActiveConnector(session.id);
        getInput()?.focus();
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
        openClipsPanel();
        return;
      }

      // "Ideas ready" result card → open the Ideas panel (same family as the
      // clips / drafts result cards).
      const openIdeasCard = event.target.closest("[data-ideas-card-open]");
      if (openIdeasCard) {
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

      // "M clips" link inside a video source-intake bubble — opens the
      // Outputs panel on the Clips sub-tab.
      const openClipsLink = event.target.closest("[data-source-intake-open-clips]");
      if (openClipsLink) {
        event.preventDefault();
        event.stopPropagation();
        openClipsPanel();
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

      // Composer "@ Mention" toolbar button — toggles the picker popup.
      const mentionTrigger = event.target.closest("[data-composer-mention-trigger]");
      if (mentionTrigger) {
        event.preventDefault();
        event.stopPropagation();
        toggleMentionPicker(root, session.id);
        return;
      }

      // Pick a source from the picker → add as pill, close the picker,
      // return focus to the textarea so the user can keep typing.
      const pickSource = event.target.closest("[data-mention-pick-source]");
      if (pickSource) {
        event.preventDefault();
        event.stopPropagation();
        const src = getSources(session.id).find((s) => s.id === pickSource.dataset.mentionPickSource);
        if (src) addComposerMention(session.id, src.filename);
        closeMentionPicker(root);
        getInput()?.focus();
        return;
      }

      // Pick an idea from the picker → same flow as sources.
      const pickIdea = event.target.closest("[data-mention-pick-idea]");
      if (pickIdea) {
        event.preventDefault();
        event.stopPropagation();
        const idea = getIdeas(session.id).find((i) => i.id === pickIdea.dataset.mentionPickIdea);
        if (idea) addComposerMention(session.id, idea.title);
        closeMentionPicker(root);
        getInput()?.focus();
        return;
      }

      // Pick a connector from the "/" command dropdown → strip the "/"
      // trigger token, attach the connector chip (askConnector → the
      // composer-connector subscriber paints the chip), then the next
      // message routes via sendConnectorMessage() (the MCP round-trip).
      const pickConnector = event.target.closest("[data-mention-pick-connector]");
      if (pickConnector) {
        event.preventDefault();
        event.stopPropagation();
        removeSlashToken(getInput());
        askConnector(session.id, pickConnector.dataset.mentionPickConnector);
        closeMentionPicker(root);
        getInput()?.focus();
        return;
      }

      // Click anywhere outside the picker / trigger → close it. This
      // runs last so the picks above still fire when clicking a row.
      const picker = root.querySelector("[data-composer-mention-picker]");
      if (picker && !picker.hidden) {
        const insidePicker = event.target.closest("[data-composer-mention-picker]");
        const onTrigger = event.target.closest("[data-composer-mention-trigger]");
        if (!insidePicker && !onTrigger) {
          closeMentionPicker(root);
        }
      }

      // Paper-clip in the composer — toggle the dropdown menu open/closed.
      // The menu offers the scripted "Add PDF/Video/URL" quick-actions plus the
      // content-ideas and content-pillar pickers.
      if (event.target.closest("[data-assistant-attach-toggle]")) {
        event.preventDefault();
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) {
          menu.hidden = !menu.hidden;
          if (!menu.hidden) placeAttachMenu(event.target.closest("[data-assistant-attach-toggle]"), menu);
        }
        return;
      }

      // Pick a playbook for this chat — bind it to the session and re-render
      // just the control in place (keeps the textarea + its text). The
      // <details> open/close is owned by the native element; we just need
      // to keep the closing-on-outside-click logic below.
      const pbPick = event.target.closest("[data-playbook-pick]");
      if (pbPick) {
        event.preventDefault();
        session.contextId = pbPick.dataset.playbookPick;
        const container = root.querySelector("[data-composer-playbook]");
        if (container) container.outerHTML = renderPlaybookControl(getContextById(session.contextId), true);
        return;
      }

      // "Create a playbook" from the picker — spawn a fresh context-builder
      // session (mirrors the /contexts new-playbook entry) and return to the
      // chat once saved, where the new playbook becomes the default.
      if (event.target.closest("[data-playbook-create]")) {
        event.preventDefault();
        // Same integrated conversational Playbook flow as the /contexts
        // "New Playbook" CTA — runs in the app shell, returns to this chat.
        try {
          window.sessionStorage.setItem("welcomeAltIntegrated", "1");
          window.sessionStorage.setItem("welcomeAltReturnTo", "/");
        } catch {
          /* ignore */
        }
        setHandoff("pendingStartContextBuilder", { flow: "alt", prefilledUrl: "", returnTo: "/" });
        navigate(`/session/welcome-alt-${Date.now().toString(36)}`);
        return;
      }

      // A connected connector in the paper-clip menu → query it live in this
      // chat (no navigation). Same flow as the right-panel "Ask".
      const attachConn = event.target.closest("[data-attach-connector]");
      if (attachConn) {
        event.preventDefault();
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = true;
        askConnector(session.id, attachConn.dataset.attachConnector);
        return;
      }

      // "Browse connectors" (bottom of the menu) → open the connectors gallery
      // modal scoped to this chat. This is the only place connecting is offered
      // from the composer.
      if (event.target.closest("[data-open-connectors]")) {
        event.preventDefault();
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = true;
        openConnectorsModal({ currentSessionId: session.id });
        return;
      }

      // Quick scripted attach items inside the paper-clip menu.
      const addSrcItem = event.target.closest("[data-add-source]");
      if (addSrcItem) {
        event.preventDefault();
        const kind = addSrcItem.dataset.addSource;
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu) menu.hidden = true;
        // "Top performing posts" isn't a source — it launches the repurpose flow
        // INLINE in this conversation (account Quickpicker → in-chat post-selection
        // widget → angle/scope/profile steps), never the full-screen studio.
        if (kind === "top-posts") {
          topPostsFlow.startTopPostsInline(session.id);
          return;
        }
        // A Content Ideas topic arrives as an already-processed SOURCE, exactly as
        // topic-flow lands one from /topics: intake-lifecycle then posts a
        // source-intake turn for it, so the pick shows up in the thread as a card
        // and every existing affordance (Extract ideas, Draft, Ask) lights up on
        // its own. No new action surface for it to need.
        if (kind === "content-ideas") {
          openIdeaPicker({ onPick: (brief) => openBriefInChat(brief.id) });
          return;
        }
        // A pillar attaches to THIS chat rather than spawning one: the composer is
        // already inside a session, so navigating away to a fresh chat would throw
        // out whatever the user was writing. attachPillarToChat is the same call
        // the /playbook dialog reaches through openPillarInChat, so "Use in chat"
        // ends identically from both surfaces.
        if (kind === "content-pillar") {
          openPillarPicker({ onPick: (ctxId, pillarId) => attachPillarToChat(session.id, ctxId, pillarId) });
          return;
        }
        // URL + Paste text need the modal UI (a URL field / textarea) — open
        // the modal on the matching tab. The URL modal is where link-service
        // detection + the "connect this service first" prompt live, so adding
        // a link from the composer routes through it too. The scripted kinds
        // (pdf / video) still attach a demo source inline.
        if (kind === "text") {
          openAddSourceModal({ tab: "pasteText", currentSessionId: session.id });
        } else if (kind === "url") {
          openAddSourceModal({ tab: "url", currentSessionId: session.id });
        } else {
          startPillFromKind(root, session, kind);
        }
        return;
      }

      // Click outside the paper-clip menu → close it.
      if (!event.target.closest(".assistant-attach")) {
        const menu = root.querySelector("[data-assistant-attach-menu]");
        if (menu && !menu.hidden) menu.hidden = true;
      }

      // Click outside the playbook control → close its picker. The
      // <details> element drives its own open state, so closing means
      // dropping the `open` attribute.
      if (!event.target.closest(".composer-playbook")) {
        const details = root.querySelector("[data-composer-playbook]");
        if (details && details.tagName === "DETAILS" && details.open) {
          details.removeAttribute("open");
        }
      }
    },
    { signal },
  );

  // Auto-grow the composer textarea as the user types — fires on
  // every input event (typing, paste, IME composition end, …) and
  // pegs the height to the current scrollHeight. CSS caps it via
  // max-height so the chrome can't be pushed off-screen.
  root.addEventListener(
    "input",
    (event) => {
      if (!event.target.matches("#assistantInput")) return;
      autosizeInput(event.target);
    },
    { signal },
  );

  // Inline top-posts widget — the DS radios are a native single-select group,
  // so selection arrives as a `change` (click or keyboard). Sync the store,
  // reflect the checked row in place (no whole-thread re-render → no image
  // reload / scroll reset), and enable the confirm CTA.
  root.addEventListener(
    "change",
    (event) => {
      const radio = event.target.closest("[data-topposts-widget-radio]");
      if (!radio || radio.disabled) return;
      toggleTopPostsWidgetPick(session.id, radio.dataset.toppostsWidgetRadio);
      const widget = radio.closest("[data-topposts-widget]");
      widget?.querySelectorAll(".top-posts-widget__row").forEach((row) => {
        row.classList.toggle("is-selected", !!row.querySelector("input[type=radio]")?.checked);
      });
      const cta = widget?.querySelector("[data-topposts-widget-confirm]");
      if (cta) cta.disabled = false;
    },
    { signal },
  );

  root.addEventListener(
    "keydown",
    (event) => {
      if (!event.target.matches("#assistantInput")) return;
      // When the @mention picker is open, arrow keys / Enter / Escape
      // drive the picker instead of the textarea — same pattern as the
      // search modal. Checked first so Enter selects a mention rather
      // than submitting the message.
      const pickerEl = root.querySelector("[data-composer-mention-picker]");
      const pickerOpen = pickerEl && !pickerEl.hidden;
      if (pickerOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          mentionHighlightIndex += 1;
          syncMentionHighlight(pickerEl);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          mentionHighlightIndex -= 1;
          syncMentionHighlight(pickerEl);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          activateHighlightedMention(pickerEl);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeMentionPicker(root);
          return;
        }
        // Tab away — close the picker so the textarea behaves like a
        // normal input again. Don't preventDefault: focus should still
        // move to the next composer button.
        if (event.key === "Tab") {
          closeMentionPicker(root);
          return;
        }
      }
      // Cmd/Ctrl+Enter sends from anywhere in the textarea (matches Claude.ai
      // and the handoff README spec). Plain Enter (no shift, no modifier)
      // also sends — preserves the archie default. Shift+Enter newlines.
      const isCmdEnter = event.key === "Enter" && (event.metaKey || event.ctrlKey);
      const isPlainEnter =
        event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (isCmdEnter || isPlainEnter) {
        event.preventDefault();
        submitInput();
        return;
      }
      // Typing "@" opens the mention picker. The "@" character itself is
      // still inserted into the textarea (we don't preventDefault) — same
      // behaviour Slack / Linear use. Escape closes the picker.
      if (event.key === "@") {
        openMentionPicker(root, session.id);
        return;
      }
      // Typing "/" opens the connector command picker — but only when the
      // connectors feature is on, at least one connector is connected, and
      // the caret is at start-of-token (input empty or preceded by
      // whitespace), so "/" inside URLs/dates is left alone. The "/" char
      // itself is still inserted (no preventDefault).
      if (event.key === "/" && isFlagOn("connectors") && getConnectedConnectors().length > 0) {
        const el = event.target;
        const caret = el.selectionStart ?? el.value.length;
        const prevChar = caret > 0 ? el.value.charAt(caret - 1) : "";
        if (caret === 0 || /\s/.test(prevChar)) {
          openMentionPicker(root, session.id, "command");
        }
        return;
      }
    },
    { signal },
  );

  // Mouse hover over a picker row updates the highlight, so keyboard
  // + mouse stay in sync (mirrors search-modal.js behaviour).
  root.addEventListener(
    "mousemove",
    (event) => {
      const row = event.target.closest("[data-mention-row-index]");
      if (!row) return;
      const picker = row.closest("[data-composer-mention-picker]");
      if (!picker || picker.hidden) return;
      const idx = Number(row.dataset.mentionRowIndex);
      if (idx === mentionHighlightIndex) return;
      mentionHighlightIndex = idx;
      syncMentionHighlight(picker);
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
      // Inline-question searchable picker — persist the query (no re-render; the
      // shared _analyse-common delegate filters rows live). Persisting means an
      // interaction-driven re-render (single-select highlight, stepper ±) keeps
      // the filter instead of snapping back to the full list.
      if (event.target.matches("[data-inline-question-search]")) {
        inlineQuestion.setSearch(session.id, event.target.value);
      }
      // Clip Studio — instructions textarea. Store silently (mutate state
      // without notify) so typing doesn't trigger a full aside re-render.
      if (event.target.matches('[data-clip-config="instructions"]')) {
        const cs = clipStudio.getState(session.id);
        if (cs) cs.config.instructions = event.target.value;
      }
      // Clip Studio — profiles-step live search. Filter the rendered rows in
      // place (no re-render → the field keeps focus); persist the query in
      // state so a checkbox-toggle re-render re-applies it.
      if (event.target.matches("[data-clip-profile-search]")) {
        clipStudio.setProfileSearch(session.id, event.target.value);
        const q = event.target.value.trim().toLowerCase();
        const list = root.querySelector(".clip-studio__profiles");
        let visible = 0;
        list?.querySelectorAll("[data-search]").forEach((row) => {
          const match = !q || row.dataset.search.includes(q);
          row.classList.toggle("is-hidden", !match);
          if (match) visible += 1;
        });
        const empty = list?.querySelector(".clip-studio__profiles-empty");
        if (empty) empty.hidden = visible !== 0;
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
      // Clip Studio — a video picked via the upload-stage file input.
      if (event.target.matches("[data-clip-studio-file]") && event.target.files?.length) {
        handleClipStudioFile(session, event.target.files[0]);
      }
      // Batch Studio — one or more files picked via the upload file input.
      if (event.target.matches("[data-batch-file]") && event.target.files?.length) {
        handleBatchFiles(session, event.target.files);
        event.target.value = ""; // allow re-picking the same file
      }
      // Clip Studio — clip duration select.
      if (event.target.matches('[data-clip-config="duration"]')) {
        clipStudio.setConfig(session.id, { duration: event.target.value });
      }
      // Clip Studio — clip selection checkbox (review grid).
      const selCb = event.target.closest("[data-clip-select]");
      if (selCb) {
        clipStudio.toggleClip(session.id, selCb.dataset.clipSelect);
      }
      // Clip Studio — profile selection checkbox (profiles step).
      const profCb = event.target.closest("[data-clip-profile]");
      if (profCb) {
        clipStudio.toggleProfile(session.id, profCb.dataset.clipProfile);
      }
    },
    { signal },
  );

  // Clip Studio — the upload-stage "Paste a URL" form submit.
  root.addEventListener(
    "submit",
    (event) => {
      if (event.target.closest("[data-clip-studio-url-form]")) {
        event.preventDefault();
        const input = root.querySelector("[data-clip-studio-url]");
        const url = (input?.value || "").trim();
        if (url) handleClipStudioUrl(session, url);
      }
    },
    { signal },
  );
}
