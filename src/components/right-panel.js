import { html, raw } from "../utils.js?v=20";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=40";
import { isFlagOn } from "../feature-flags.js?v=3";
import { ideas as MOCK_IDEAS } from "../mocks.js?v=37";
import { isNewUser } from "../user-mode.js?v=22";
import { getPath } from "../router.js?v=30";
import { parseHashParams, setHashQuery } from "../url-state.js?v=21";
import {
  getPosts,
  addPostDraft,
  removePost,
  insertPost,
  updatePostContent,
  subscribe as subscribePostsStore,
} from "../posts-store.js?v=28";
import { renderPostCard } from "./post-card.js?v=31";
import { renderClipCard } from "./clip-card.js?v=7";
// Shared compact idea card — same component the standalone Ideas page uses.
import { renderCompactIdeaCard } from "./idea-card-compact.js?v=1";
import { open as openVideoClipsModal } from "./video-clips-modal.js?v=12";
import { isSidebarCollapsed, setSidebarCollapsed } from "./sidebar.js?v=71";
import {
  getSources as getStreamSources,
  subscribeSources,
  updateSourceClips,
  removeSources,
  renameSource,
} from "../sources-stream.js?v=35";
import { open as openAddSourceModal } from "./add-source-modal.js?v=27";
import { open as openRenameModal } from "./rename-modal.js?v=2";
import { getConnectedConnectors } from "../connectors-store.js?v=22";
import { askConnector } from "../connector-ask.js?v=2";
import { renderConnectorLogo } from "../connectors-view.js?v=2";
import { open as openConnectorsModal } from "./connectors-modal.js?v=3";
import { addMention as addComposerMention } from "../composer-mentions.js?v=6";
import { iconFor } from "../file-kinds.js?v=20";

// Lot 15 — empty in first-time mode so the right-panel Ideas surface lines
// up with the rest of the chrome (sidebar Recent list = empty, dashboard
// = first-run welcome). Returning user gets the full seed.
const IDEAS = isNewUser() ? [] : MOCK_IDEAS;
import { open as openScheduleModal } from "./schedule-modal.js?v=26";
import { open as openGenerateImageModal } from "./generate-image-modal.js?v=24";
import { open as openConfirmModal } from "./confirm-modal.js?v=22";

// Global Right Panel — slides in from the right edge of the viewport, overlays
// the session workspace, hosts two modes:
//   • 'drafts' — the AI's batch result (editable BatchCards, network-grouped,
//                Schedule N posts CTA).
//   • 'ideas'  — compact searchable Ideas library that injects a chosen idea
//                into the chat (Lot 5).
//
// State lives module-local; subscribers (the in-thread Drafts summary card,
// any future topbar pills, the assistant bubble) notify on transitions.
//
// Lot 4.2 — DraftsView renders network-grouped BatchCards from the active
// batch's assistant message. Selection state lives in this module and
// resets per batch. The Schedule button is wired but the modal lands in
// Lot 9; until then it shows a toast.

const PANEL_ID = "rightPanel";

// Resize-handle bounds. The width is now driven by the (viewport −
// sidebar) / 2 formula in layout.css ; the runtime override is only
// set transiently while the user drags the handle and is reset on
// every panel open so the formula reasserts as the canonical default.
const PANEL_MIN_WIDTH = 380;
const PANEL_MAX_RIGHT_GAP = 400; // leave at least this much for sidebar+content
// Stale localStorage key from the pre-formula era — wiped on init so
// upgrading users don't keep seeing the panel at their old custom width.
const LEGACY_PANEL_WIDTH_KEY = "archie-rpanel-width";
const DRAFT_INLINE_EDIT_FLAG = "draftInlineEdit";

// Idea kind taxonomy — handoff Ideas filter rail (§ 2.6). Order is the order
// shown in the chip row. The .kind selector also drives the per-kind tag
// color so each kind reads at a glance.
const IDEA_KINDS = [
  { id: "all", label: "All" },
  { id: "hook", label: "Hooks" },
  { id: "stat", label: "Stats" },
  { id: "quote", label: "Quotes" },
  { id: "story", label: "Stories" },
  { id: "insight", label: "Insights" },
];

// Ideas-mode local UI state — filter chip + search query + sort axis +
// the id of the single card currently expanded (accordion: only one open
// at a time). Survives across renderPanel() calls but is reset when the
// panel re-opens in a fresh session via renderIdeasBodyOnly().
let ideasFilter = "all";

// Outputs sub-view inside Ideas mode — "ideas" or "clips". Unifies the
// two AI-extracted output types of a source under one persistent surface
// so users keep their workflow continuity (PDF 06.B flow). When the
// session's sources gain clips for the first time, the panel auto-flips
// to the Clips tab so the result feels surfaced rather than buried.
let outputsView = "ideas";

// Per-clip selection inside the Clips tab — Set<clipId>. Multi-select
// drives the sticky footer "Draft posts from N clips" CTA.
let clipSelection = new Set();

// Drafts-mode local UI state — Lot 21 rich-card view. Filter strip at the
// top of the panel head drives both axes : status (all / needs_fixes /
// scheduled) and network (all / linkedin / twitter). Survives across
// open/close cycles so the user keeps their filter when they re-open.
let draftsFilter = "all";
let draftsNetwork = "all";

// Multi-select state for bulk scheduling. Lives across renders inside the
// panel; cleared when a session change or a bulk-schedule confirm fires.
let selectedDraftIds = new Set();

// Inline-edit state — only one card in edit mode at a time. Snapshot of
// the original body fields powers the "no spurious save" check.
let editingPostId = null;
let editingOriginal = null; // { text:[], hashtags:[], cta:"" } | null

let state = {
  mode: null, // 'drafts' | 'ideas' | 'sources' | 'context-brief' | null
  activeBatchRef: null, // { sessionId, messageId } | null
};

// ── URL persistence ───────────────────────────────────────────────────
// The user-facing panel modes (drafts / ideas / sources) are encoded in
// the hash query as `?panel=<mode>` so the panel re-opens on reload and
// deep-links work. `context-brief` is NOT persisted — it's driven by the
// Playbooks navigation, not by a user-toggleable session control.
const VALID_URL_MODES = new Set(["drafts", "ideas", "sources"]);

function writeUrlPanel(mode) {
  const params = parseHashParams();
  if (mode && VALID_URL_MODES.has(mode)) {
    params.set("panel", mode);
  } else {
    params.delete("panel");
  }
  setHashQuery(getPath(), Object.fromEntries(params));
}

function readUrlPanel() {
  const m = parseHashParams().get("panel");
  return VALID_URL_MODES.has(m) ? m : null;
}

// Sync internal state to the URL `panel` param. Called on boot AND on
// hashchange so back/forward buttons work. No-op when state already
// matches (avoids infinite write → hashchange → write loops).
// Skipped off-session — the panel is a session-scoped affordance, so a
// stray `?panel=drafts` on /contexts shouldn't pop the panel.
function syncFromUrl() {
  if (!/^\/session\//.test(getPath())) {
    // The panel is a session-scoped affordance — close it when navigating
    // off a session (Playbooks, Settings, Dashboard…). skipUrl so we don't
    // rewrite the new route's hash.
    if (state.mode) closePanel({ skipUrl: true });
    return;
  }
  const urlMode = readUrlPanel();
  if (urlMode === state.mode) return;
  if (urlMode === "drafts") openDrafts(null);
  else if (urlMode === "ideas") openIdeas();
  else if (urlMode === "sources") openSources();
  else if (state.mode && VALID_URL_MODES.has(state.mode)) closePanel();
}

// Per-batch selection — Map<"sessionId::messageId", Set<postId>>. Defaults
// to all-selected the first time a batch is shown so the Schedule CTA is
// active out of the box.
// Subscriber bookkeeping — when the panel is open in Drafts mode we listen
// to the assistant thread so the panel re-renders when the batch's status
// changes (e.g. additional drafts land).
let unsubscribeActiveThread = null;
const subs = new Set();

function notify() {
  for (const fn of subs) fn(state);
}

function canDraftInlineEdit() {
  return isFlagOn(DRAFT_INLINE_EDIT_FLAG);
}

export function getMode() {
  return state.mode;
}

export function getActiveBatchRef() {
  return state.activeBatchRef;
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Auto-collapse the sidebar whenever a right-panel opens — clawing
// back the ~204px (260 − 56) so the chat + panel breathe regardless
// of viewport. We deliberately don't auto-restore on close (the user
// re-expands manually) and we don't run on mode swaps inside an
// already-open panel — only on the closed → open transition.
function maybeCollapseSidebar() {
  if (!state.mode) return;
  if (isSidebarCollapsed()) return;
  setSidebarCollapsed(true);
}

function maybeCollapseSidebarOnOpen(prevMode) {
  if (prevMode !== null) return; // mode swap, not an open
  // Defer until after the renderPanel() call that follows in the open*
  // helper completes. Until the panel's `hidden` flag flips and the grid
  // column resolves, panel.offsetWidth would still read 0 and our chat-
  // width math would think there's plenty of room.
  requestAnimationFrame(maybeCollapseSidebar);
}

// Track the element that had focus when the panel opened so we can
// return focus to it on close. Only captured on a fresh open (prev=null);
// mode swaps reuse the original snapshot.
let lastFocusBeforeOpen = null;

function snapshotFocusOnOpen(prevMode) {
  if (prevMode !== null) return;
  const active = document.activeElement;
  lastFocusBeforeOpen = active instanceof HTMLElement ? active : null;
}

function restoreFocusOnClose() {
  const target = lastFocusBeforeOpen;
  lastFocusBeforeOpen = null;
  if (!target || typeof target.focus !== "function") return;
  if (!document.body.contains(target)) return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    // ignore — element may have been removed mid-frame
  }
}

// Open in Drafts mode pinned to a specific assistant message in a session.
// Called by the in-thread Drafts summary card (Lot 4.3).
export function openDrafts(activeBatchRef) {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  state = { mode: "drafts", activeBatchRef: activeBatchRef || state.activeBatchRef };
  maybeCollapseSidebarOnOpen(prev);
  rebindThread();
  renderPanel();
  notify();
  writeUrlPanel("drafts");
}

export function openIdeas() {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  state = { ...state, mode: "ideas" };
  outputsView = "ideas";
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
  writeUrlPanel("ideas");
}

// Same surface as openIdeas (mode: "ideas"), but lands the user on the
// Clips sub-tab. Used by the source-intake bubble's "M clips" pill so
// the user goes directly to the clips view for the source they just
// attached.
export function openClips() {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  state = { ...state, mode: "ideas" };
  outputsView = "clips";
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
  writeUrlPanel("ideas");
}

// Sources mode — shows the list of sources currently attached to the
// active session. Distinct surface from Outputs (Ideas/Clips) since a
// source is an INPUT to the conversation, not an AI-generated output.
export function openSources() {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  state = { ...state, mode: "sources" };
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
  writeUrlPanel("sources");
}

export function closePanel({ skipUrl = false } = {}) {
  const wasUserMode = VALID_URL_MODES.has(state.mode);
  if (state.mode === "context-brief") {
    contextBriefConfig?.onCancel?.();
    contextBriefConfig = null;
  }
  state = { ...state, mode: null };
  if (unsubscribeActiveThread) {
    unsubscribeActiveThread();
    unsubscribeActiveThread = null;
  }
  renderPanel();
  notify();
  // Only clear the `panel` URL param if we were in a user-toggleable mode.
  // context-brief isn't URL-persisted, so closing it shouldn't touch the
  // hash query (which might happen to carry an unrelated panel value).
  // `skipUrl` is used when closing as a side-effect of navigating off a
  // session — the new route owns the URL, we mustn't rewrite it.
  if (wasUserMode && !skipUrl) writeUrlPanel(null);
  // Return focus to the element that had it before the panel opened so
  // keyboard users don't get marooned. Modal-coordinator does this
  // automatically for modals; the right-panel is a push panel so we
  // mirror the pattern here.
  restoreFocusOnClose();
}

function setMode(mode) {
  if (mode !== "drafts" && mode !== "ideas") return;
  state = { ...state, mode };
  rebindThread();
  renderPanel();
  notify();
}

// V1 brief-builder panel — opens a side-by-side scrollable form. Two
// modes:
//   - edit (default): caller owns the draft state and supplies callbacks
//     for chips, CTA checkboxes, name, save, cancel.
//   - read: read-only view of an existing Context. getCtx() returns the
//     persisted Context. onEnterEdit fires when the user clicks "Edit"
//     in the footer (typically routes through contextBuilder.startEdit).
let contextBriefConfig = null;

// Voice-profile UI state — survives the brief panel's frequent
// re-renders triggered by `refreshContextBriefPanel`. Tracks the set
// of subsection ids whose body has been expanded past the ~140-char
// snippet via the per-card "Show more" link. Module-local so the
// state doesn't bleed into the persisted Context.
const voiceProfileExpanded = new Set();

// CTA editor manage-mode state. Open → renders an editable sub-panel
// beneath the compact list. Snapshot is taken when Manage opens so
// Cancel can revert to the pre-edit ctaLinks.
let ctaManageOpen = false;
let ctaManageSnapshot = null;

export function openContextBriefPanel(config = {}) {
  const prev = state.mode;
  if (prev === null) resetPanelWidthOverride();
  snapshotFocusOnOpen(prev);
  contextBriefConfig = { mode: "edit", ...config };
  // Fresh open — collapse all expanded snippets so the user lands on
  // a clean overview.
  voiceProfileExpanded.clear();
  ctaManageOpen = false;
  ctaManageSnapshot = null;
  state = { ...state, mode: "context-brief" };
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
}
export function refreshContextBriefPanel() {
  if (state.mode !== "context-brief") return;
  // Preserve scroll across re-renders — chip toggles call this on every
  // click, and a naïve innerHTML rewrite would snap the user back to the
  // top.
  const body = document.querySelector("#" + PANEL_ID + " .context-brief__body");
  const scrollTop = body?.scrollTop || 0;
  renderPanel();
  const nextBody = document.querySelector("#" + PANEL_ID + " .context-brief__body");
  if (nextBody && scrollTop) nextBody.scrollTop = scrollTop;
}
export function closeContextBriefPanelSilently() {
  if (state.mode !== "context-brief") return;
  contextBriefConfig = null;
  state = { ...state, mode: null };
  renderPanel();
  notify();
}

// Subscribe to the active session's thread so the panel reflects late-
// landing batch changes. Tear down + re-create on every mode flip / batch
// switch so we never leak listeners across sessions.
function rebindThread() {
  if (unsubscribeActiveThread) {
    unsubscribeActiveThread();
    unsubscribeActiveThread = null;
  }
  if (state.mode !== "drafts" || !state.activeBatchRef?.sessionId) return;
  unsubscribeActiveThread = subscribeThread(state.activeBatchRef.sessionId, () => {
    if (state.mode === "drafts") renderPanel();
  });
}

export function init() {
  let el = document.getElementById(PANEL_ID);
  if (!el) {
    el = document.createElement("aside");
    el.id = PANEL_ID;
    el.className = "app-right-panel";
    // The aria-label is updated per mode in renderPanel() below — this
    // is just the initial value for when the panel is hidden.
    el.setAttribute("aria-label", "Side panel");
    el.hidden = true;
    // Lot 17.d — mount inside #appShell so the panel becomes a grid cell
    // (row 2, column 3). Falls back to <body> if the shell isn't there yet
    // (shouldn't happen in normal boot order, but defensive).
    const shell = document.getElementById("appShell") || document.body;
    shell.appendChild(el);
  }
  // Drop any leftover persisted width from the pre-formula era so the
  // (viewport − sidebar) / 2 default takes hold on first paint.
  clearLegacyPanelWidth();
  resetPanelWidthOverride();

  // Resize handle — mousedown begins drag, document-level mousemove +
  // mouseup tracks until release.
  el.addEventListener("mousedown", (event) => {
    if (event.target.closest("[data-rpanel-resize]")) {
      startResizeDrag(event);
    }
  });

  el.addEventListener("click", (event) => {
    // Auto-commit any in-progress edit when the click lands outside the
    // current editor + its Save/Cancel buttons. Falls through so a click
    // on another card's pen icon (or any other action) still routes
    // through the normal handlers below.
    if (canDraftInlineEdit() && editingPostId) {
      const insideCurrent = event.target.closest(
        `[data-post-editor="${editingPostId}"], [data-post-edit-save="${editingPostId}"], [data-post-edit-cancel="${editingPostId}"]`,
      );
      if (!insideCurrent) commitEdit(editingPostId);
    }
    if (event.target.closest("[data-rpanel-close]")) {
      closePanel();
      return;
    }
    const tab = event.target.closest("[data-rpanel-tab]");
    if (tab) {
      setMode(tab.dataset.rpanelTab);
      return;
    }
    // Drafts filter chips — status + network.
    const filterChip = event.target.closest("[data-rpanel-drafts-filter]");
    if (filterChip) {
      draftsFilter = filterChip.dataset.rpanelDraftsFilter;
      renderPanel();
      return;
    }
    const networkChip = event.target.closest("[data-rpanel-drafts-network]");
    if (networkChip) {
      draftsNetwork = networkChip.dataset.rpanelDraftsNetwork;
      renderPanel();
      return;
    }
    if (event.target.closest("[data-rpanel-drafts-clear]")) {
      draftsFilter = "all";
      draftsNetwork = "all";
      renderPanel();
      return;
    }
    if (event.target.closest("[data-rpanel-drafts-bulk-clear]")) {
      selectedDraftIds.clear();
      renderPanel();
      return;
    }
    if (event.target.closest("[data-rpanel-drafts-bulk-delete]")) {
      onBulkDelete();
      return;
    }
    if (event.target.closest("[data-rpanel-drafts-bulk-schedule]")) {
      onBulkSchedule();
      return;
    }
    // Per-card actions on a single draft (Lot 21 rich PostCard).
    const editBtn = event.target.closest("[data-post-edit]");
    if (canDraftInlineEdit() && editBtn) {
      startEdit(editBtn.dataset.postEdit);
      return;
    }
    const saveBtn = event.target.closest("[data-post-edit-save]");
    if (canDraftInlineEdit() && saveBtn) {
      commitEdit(saveBtn.dataset.postEditSave);
      return;
    }
    const cancelBtn = event.target.closest("[data-post-edit-cancel]");
    if (canDraftInlineEdit() && cancelBtn) {
      cancelEdit(cancelBtn.dataset.postEditCancel);
      return;
    }
    const rewriteBtn = event.target.closest("[data-post-rewrite]");
    if (rewriteBtn) {
      onPostRewrite(rewriteBtn.dataset.postRewrite);
      return;
    }
    const scheduleBtn = event.target.closest("[data-post-schedule]");
    if (scheduleBtn) {
      // The Edit affordance on the scheduled status-card renders as an
      // <a href="#"> per DS pattern — swallow the default so the URL
      // hash doesn't get dirtied when it's clicked.
      if (scheduleBtn.tagName === "A") event.preventDefault();
      onPostSchedule(scheduleBtn.dataset.postSchedule);
      return;
    }
    const dupBtn = event.target.closest("[data-post-duplicate]");
    if (dupBtn) {
      onPostDuplicate(dupBtn.dataset.postDuplicate);
      return;
    }
    const delBtn = event.target.closest("[data-post-delete]");
    if (delBtn) {
      onPostDelete(delBtn.dataset.postDelete);
      return;
    }
    const imageBtn = event.target.closest("[data-post-image]");
    if (imageBtn) {
      onPostImage(imageBtn.dataset.postImage);
      return;
    }
    // Sources mode — "+ Attach" opens the Add Source modal scoped to
    // the active session. The modal handles upload/URL/connectors; the
    // upload pipeline creates sources directly in this session's list,
    // and the source-stream subscription below repaints the panel.
    if (event.target.closest("[data-rpanel-sources-attach]")) {
      const sid = activeSessionId();
      if (!sid) return;
      openAddSourceModal({
        currentSessionId: sid,
      });
      return;
    }
    // "Connect" in the Live connectors head — open the connectors modal scoped
    // to this chat (Try-in-chat will ask here, no navigation).
    if (event.target.closest("[data-rpanel-open-connectors]")) {
      openConnectorsModal({ currentSessionId: activeSessionId() });
      return;
    }
    // Live connector "Ask" — a connected connector is a queryable live source.
    // Launch the in-chat ask flow and close the panel so the chat is visible.
    const askConnBtn = event.target.closest("[data-rpanel-ask-connector]");
    if (askConnBtn) {
      const sid = activeSessionId();
      const id = askConnBtn.dataset.rpanelAskConnector;
      if (sid && id) {
        askConnector(sid, id);
        closePanel();
      }
      return;
    }
    // Source card kebab (…) — toggle its dropdown, one open at a time.
    const sourceMoreBtn = event.target.closest("[data-rpanel-source-more]");
    if (sourceMoreBtn) {
      const menu = document.getElementById(sourceMoreBtn.getAttribute("aria-controls"));
      const willOpen = !!menu && menu.hidden;
      closeAllSourceMenus(willOpen ? menu : null);
      if (menu) {
        menu.hidden = !willOpen;
        sourceMoreBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      }
      return;
    }
    // Kebab → Reanalyze (prototype stub — confirms via toast).
    const reanalyzeBtn = event.target.closest("[data-rpanel-source-reanalyze]");
    if (reanalyzeBtn) {
      const sid = activeSessionId();
      closeAllSourceMenus();
      if (!sid) return;
      const src = getStreamSources(sid).find((s) => s.id === reanalyzeBtn.dataset.rpanelSourceReanalyze);
      import("./toast.js?v=20").then(({ showToast }) =>
        showToast(`Reanalyzing ${src?.filename || "source"}…`, { duration: 2600 }),
      );
      return;
    }
    // Kebab → Edit name (rename the source via the shared rename modal —
    // the same one used to rename a chat).
    const renameBtn = event.target.closest("[data-rpanel-source-rename]");
    if (renameBtn) {
      const sid = activeSessionId();
      closeAllSourceMenus();
      if (!sid) return;
      const id = renameBtn.dataset.rpanelSourceRename;
      const src = getStreamSources(sid).find((s) => s.id === id);
      openRenameModal({
        title: "Rename source",
        initialName: src?.filename || "",
        placeholder: "Source name",
        confirmLabel: "Save name",
        onSubmit: (name) => renameSource(sid, id, name),
      });
      return;
    }
    // Delete source — destructive: it also removes the ideas derived from
    // this source, so gate it behind a confirm modal with an explicit
    // warning before cascading the removal.
    const sourcesDetachBtn = event.target.closest("[data-rpanel-sources-detach]");
    if (sourcesDetachBtn) {
      const sid = activeSessionId();
      if (!sid) return;
      closeAllSourceMenus();
      const id = sourcesDetachBtn.dataset.rpanelSourcesDetach;
      const src = getStreamSources(sid).find((s) => s.id === id);
      const ideaN = IDEAS.filter((i) => Array.isArray(i.sourceIds) && i.sourceIds.includes(id)).length;
      const ideaWarning =
        ideaN > 0 ? ` Its ${ideaN} associated idea${ideaN === 1 ? "" : "s"} will be deleted too.` : "";
      openConfirmModal({
        title: "Delete this source?",
        body: `“${src?.filename || "This source"}” will be removed from this chat.${ideaWarning} This can’t be undone.`,
        confirmLabel: "Delete source",
        danger: true,
        onConfirm: () => {
          // Cascade — drop the ideas derived from this source first, then the
          // source itself (whose removal notifies + repaints the panel).
          for (let i = IDEAS.length - 1; i >= 0; i -= 1) {
            if (Array.isArray(IDEAS[i].sourceIds) && IDEAS[i].sourceIds.includes(id)) IDEAS.splice(i, 1);
          }
          removeSources([id], sid);
        },
      });
      return;
    }
    // Idea link on a source card → switch the panel to Outputs (Ideas tab)
    // and pulse + scroll to that specific idea card so the user lands on it.
    const sourceIdeaLink = event.target.closest("[data-rpanel-source-idea]");
    if (sourceIdeaLink) {
      const ideaId = sourceIdeaLink.dataset.rpanelSourceIdea;
      outputsView = "ideas";
      state = { ...state, mode: "ideas" };
      renderPanel();
      // Wait for the panel re-render, then pulse the target idea card.
      requestAnimationFrame(() => {
        const panel = document.querySelector(".app-right-panel");
        if (!panel) return;
        const card = panel.querySelector(`[data-idea-id="${ideaId}"]`);
        if (!card) return;
        card.classList.remove("is-focused");
        void card.offsetWidth;
        card.classList.add("is-focused");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      notify();
      return;
    }
    // Outputs sub-view tab — Ideas | Clips.
    const outputsTab = event.target.closest("[data-rpanel-outputs-tab]");
    if (outputsTab) {
      const next = outputsTab.dataset.rpanelOutputsTab;
      if (next !== outputsView) {
        outputsView = next;
        clipSelection = new Set();
        renderPanel();
      }
      return;
    }
    // Ideas filter chip.
    const chip = event.target.closest("[data-rpanel-ideas-filter]");
    if (chip) {
      ideasFilter = chip.dataset.rpanelIdeasFilter;
      renderPanel();
      return;
    }
    if (event.target.closest("[data-rpanel-ideas-clear]")) {
      ideasFilter = "all";
      renderPanel();
      return;
    }
    // Clip selection toggle (multi-select in Clips tab).
    const clipSelectInput = event.target.closest("[data-clip-select]");
    if (clipSelectInput) {
      const cid = clipSelectInput.getAttribute("data-clip-select");
      if (clipSelection.has(cid)) clipSelection.delete(cid);
      else clipSelection.add(cid);
      renderPanel();
      return;
    }
    // Clip-card "Edit" affordance (kebab menu item or thumbnail click).
    // Opens the video-clips modal pre-positioned on the target clip so
    // the user lands directly on the trim/preview surface.
    const clipEditBtn = event.target.closest("[data-clip-edit]");
    if (clipEditBtn) {
      const cid = clipEditBtn.getAttribute("data-clip-edit");
      const sid = activeSessionId();
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      if (entry && sid) {
        const source = getStreamSources(sid).find((s) => s.id === entry.sourceId);
        if (source) {
          openVideoClipsModal(source, {
            editingClipId: cid,
            onSaveClips: (id, nextClips) => updateSourceClips(id, nextClips),
          });
        }
      }
      return;
    }
    // Clip-card "Remove clip" kebab item — mutates the parent source's
    // clips array via sources-stream. The auto-subscribe in this panel
    // re-renders on the resulting notify.
    const clipRemoveBtn = event.target.closest("[data-clip-remove]");
    if (clipRemoveBtn) {
      const cid = clipRemoveBtn.getAttribute("data-clip-remove");
      const sid = activeSessionId();
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      if (entry && sid) {
        const source = getStreamSources(sid).find((s) => s.id === entry.sourceId);
        if (source && Array.isArray(source.clips)) {
          const nextClips = source.clips.filter((c) => c.id !== cid);
          updateSourceClips(source.id, nextClips);
          clipSelection.delete(cid);
        }
      }
      return;
    }
    // Thumbs-up / thumbs-down feedback on a clip card. Mirrors the idea
    // feedback handler — clicking the same side twice clears the verdict.
    // In-place DOM update so the scroll position of the clips list is
    // preserved (full re-render would reset it).
    const clipFeedbackBtn = event.target.closest("[data-rpanel-clip-feedback]");
    if (clipFeedbackBtn) {
      const cid = clipFeedbackBtn.dataset.rpanelClipFeedback;
      const verdict = clipFeedbackBtn.dataset.verdict;
      toggleClipFeedbackInPlace(cid, verdict, clipFeedbackBtn);
      return;
    }
    // "Why this clip" panel — collapse / expand. Toggle the section in
    // place so the user's scroll position survives.
    const clipWhyBtn = event.target.closest("[data-rpanel-clip-why-toggle]");
    if (clipWhyBtn) {
      event.preventDefault();
      toggleClipWhyInPlace(clipWhyBtn.dataset.rpanelClipWhyToggle, clipWhyBtn);
      return;
    }
    // Per-card "Mention" — adds the clip to the composer mention pills
    // for the active session. Same funnel as source/idea mentions so the
    // user can cite a specific clip in their next prompt.
    const clipMentionBtn = event.target.closest("[data-clip-mention]");
    if (clipMentionBtn) {
      const cid = clipMentionBtn.getAttribute("data-clip-mention");
      const sid = activeSessionId();
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      if (sid && entry) addComposerMention(sid, entry.clip.title);
      return;
    }
    // Per-card "Draft Post" — kicks off the 3-step quick-picker flow
    // (accounts → aspect ratio → subtitle style) in the session assistant,
    // which then generates one draft per chosen account.
    const clipDraftBtn = event.target.closest("[data-clip-draft]");
    if (clipDraftBtn) {
      const cid = clipDraftBtn.getAttribute("data-clip-draft");
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      const sid = activeSessionId();
      if (!sid || !entry) return;
      const { clip, sourceName } = entry;
      import("../screens/session.js?v=187").then(({ startClipDraftFlow }) => {
        startClipDraftFlow(sid, clip, sourceName);
      });
      return;
    }
    // Footer CTA — draft posts from the selected clips into the active
    // session. Mirrors the onUseClips logic that used to live behind the
    // video-clips-modal CTA: one draft per clip, clipRef carries trim +
    // source name + hue so post-card can render its video PIP. After
    // drafts land, fires the PDF-flow 06.B subtitle preset question into
    // the assistant thread.
    if (event.target.closest("[data-rpanel-clips-draft]")) {
      const sid = activeSessionId();
      if (!sid) return;
      const all = collectAllClips();
      const picked = all.filter(({ clip }) => clipSelection.has(clip.id));
      if (picked.length === 0) return;
      const drafts = picked.map(({ clip, sourceName }) =>
        addPostDraft(sid, {
          network: clip.network,
          text: [clip.title, clip.summary].filter(Boolean),
          hashtags: (clip.tags || []).map((t) => `#${t}`),
          clipRef: {
            start: clip.start,
            end: clip.end,
            sourceName,
            hue: clip.hue,
          },
        }),
      );
      clipSelection = new Set();
      renderPanel();
      import("./toast.js").then(({ showToast }) =>
        showToast(`Drafted ${drafts.length} post${drafts.length === 1 ? "" : "s"} from clips`, { duration: 3200 }),
      );
      // PDF flow 06.B — ask the user for a subtitle preset. We import
      // lazily to keep this module decoupled from the session screen.
      import("../screens/session.js?v=187").then(({ postSubtitleQuestion }) => {
        postSubtitleQuestion(
          sid,
          drafts.map((d) => d.id),
        );
      });
      return;
    }
    // Mention this idea in the composer.
    const mentionIdeaBtn = event.target.closest("[data-rpanel-mention-idea]");
    if (mentionIdeaBtn) {
      const sid = activeSessionId();
      if (!sid) return;
      const idea = IDEAS.find((i) => i.id === mentionIdeaBtn.dataset.rpanelMentionIdea);
      if (idea) addComposerMention(sid, idea.title);
      return;
    }
    // Mention this source in the composer.
    const mentionSourceBtn = event.target.closest("[data-rpanel-mention-source]");
    if (mentionSourceBtn) {
      const sid = activeSessionId();
      if (!sid) return;
      const src = getStreamSources(sid).find((s) => s.id === mentionSourceBtn.dataset.rpanelMentionSource);
      if (src) addComposerMention(sid, src.filename);
      return;
    }
    // Use this idea → opens the count + profile picker flow.
    const useBtn = event.target.closest("[data-rpanel-use-idea]");
    if (useBtn) {
      useIdea(useBtn.dataset.rpanelUseIdea);
      return;
    }
    // Thumbs-up / thumbs-down feedback on an idea card.
    const feedbackBtn = event.target.closest("[data-rpanel-ideas-feedback]");
    if (feedbackBtn) {
      const id = feedbackBtn.dataset.rpanelIdeasFeedback;
      const verdict = feedbackBtn.dataset.verdict;
      toggleIdeaFeedback(id, verdict);
      return;
    }
    // "Why this idea" panel — collapse / expand.
    const whyBtn = event.target.closest("[data-rpanel-idea-why-toggle]");
    if (whyBtn) {
      event.preventDefault();
      toggleWhyOpen(whyBtn.dataset.rpanelIdeaWhyToggle);
      return;
    }

    // --- V1 brief panel handlers ---
    const briefChip = event.target.closest("[data-brief-chip-field]");
    if (briefChip) {
      contextBriefConfig?.onToggleChip?.(briefChip.dataset.briefChipField, briefChip.dataset.briefChipValue);
      return;
    }
    const briefSingle = event.target.closest("[data-brief-single-field]");
    if (briefSingle) {
      contextBriefConfig?.onAnswer?.(briefSingle.dataset.briefSingleField, briefSingle.dataset.briefSingleValue);
      return;
    }
    const briefColor = event.target.closest("[data-brief-color]");
    if (briefColor) {
      contextBriefConfig?.onAnswer?.("color", briefColor.dataset.briefColor);
      return;
    }
    const briefOtherToggle = event.target.closest("[data-brief-other-toggle]");
    if (briefOtherToggle) {
      const field = briefOtherToggle.dataset.briefOtherToggle;
      const wrap = el.querySelector(`[data-brief-other-wrap="${field}"]`);
      if (wrap) {
        wrap.hidden = !wrap.hidden;
        if (!wrap.hidden) wrap.querySelector("input")?.focus();
      }
      return;
    }
    const briefOtherSubmit = event.target.closest("[data-brief-other-submit]");
    if (briefOtherSubmit) {
      const field = briefOtherSubmit.dataset.briefOtherSubmit;
      const input = el.querySelector(`[data-brief-other-input="${field}"]`);
      const v = (input?.value || "").trim();
      if (!v) return;
      contextBriefConfig?.onAddOther?.(field, v);
      return;
    }
    const briefCta = event.target.closest("[data-brief-cta-toggle]");
    if (briefCta) {
      // The native checkbox toggles its own state; we just propagate.
      contextBriefConfig?.onToggleCta?.(briefCta.dataset.briefCtaToggle);
      return;
    }
    // New CTA editor — index-based toggle (URLs can change in manage
    // mode so we keep identity stable via position in the list).
    const briefCtaIdx = event.target.closest("[data-brief-cta-toggle-idx]");
    if (briefCtaIdx) {
      const idx = Number(briefCtaIdx.dataset.briefCtaToggleIdx);
      contextBriefConfig?.onCtaToggleAt?.(idx);
      return;
    }
    // Manage CTA panel open / close.
    if (event.target.closest("[data-brief-cta-manage]")) {
      event.preventDefault();
      const draft = contextBriefConfig?.getDraft?.();
      ctaManageSnapshot = JSON.parse(JSON.stringify(draft?.ctaLinks || []));
      ctaManageOpen = true;
      refreshContextBriefPanel?.();
      return;
    }
    if (event.target.closest("[data-brief-cta-manage-done]")) {
      event.preventDefault();
      ctaManageOpen = false;
      ctaManageSnapshot = null;
      refreshContextBriefPanel?.();
      return;
    }
    if (event.target.closest("[data-brief-cta-manage-cancel]")) {
      event.preventDefault();
      contextBriefConfig?.onCtaRestore?.(ctaManageSnapshot || []);
      ctaManageOpen = false;
      ctaManageSnapshot = null;
      refreshContextBriefPanel?.();
      return;
    }
    const briefCtaDelete = event.target.closest("[data-brief-cta-delete]");
    if (briefCtaDelete) {
      event.preventDefault();
      contextBriefConfig?.onCtaDelete?.(Number(briefCtaDelete.dataset.briefCtaDelete));
      refreshContextBriefPanel?.();
      return;
    }
    if (event.target.closest("[data-brief-cta-add]")) {
      event.preventDefault();
      contextBriefConfig?.onCtaAdd?.();
      refreshContextBriefPanel?.();
      // Focus the newly-appended label input so the user can start typing.
      setTimeout(() => {
        const inputs = document.querySelectorAll("[data-brief-cta-label]");
        inputs[inputs.length - 1]?.focus();
      }, 0);
      return;
    }
    // Voice profile: per-card "Show more" link toggles the snippet/full
    // body for that subsection (module-local state, see voiceProfileExpanded).
    const briefVoiceToggle = event.target.closest("[data-brief-voice-toggle]");
    if (briefVoiceToggle) {
      const id = briefVoiceToggle.dataset.briefVoiceToggle;
      if (voiceProfileExpanded.has(id)) voiceProfileExpanded.delete(id);
      else voiceProfileExpanded.add(id);
      refreshContextBriefPanel?.();
      return;
    }
    if (event.target.closest("[data-brief-save]")) {
      contextBriefConfig?.onSave?.();
      return;
    }
    if (event.target.closest("[data-brief-cancel]")) {
      // Hosts that want to redirect (e.g. flip back to read mode in
      // place) can return a truthy value from onCancel to suppress the
      // default panel teardown. Everything else falls through to a
      // full close.
      const handled = contextBriefConfig?.onCancel?.();
      if (!handled) closePanel();
      return;
    }
    if (event.target.closest("[data-brief-edit-mode]")) {
      contextBriefConfig?.onEnterEdit?.();
      return;
    }
    const refineBtn = event.target.closest("[data-brief-refine-field]");
    if (refineBtn) {
      // Hover-reveal Refine button on each read-mode section card.
      // Routes to a field-targeted playbook-editor flow via the host
      // (see `context-builder.openRead` → `playbookEditor.refineField`).
      contextBriefConfig?.onRefineField?.(refineBtn.dataset.briefRefineField);
      return;
    }
  });
  el.addEventListener("change", (event) => {
    // Per-card multi-select checkbox.
    if (event.target.matches("[data-post-select]")) {
      const id = event.target.dataset.postSelect;
      if (event.target.checked) selectedDraftIds.add(id);
      else selectedDraftIds.delete(id);
      renderPanel();
      return;
    }
    // "Select all visible" pill — flips every schedulable draft in the
    // current filter on or off depending on the new checked state.
    if (event.target.matches("[data-rpanel-drafts-select-all]")) {
      const sid = activeSessionId();
      if (!sid) return;
      const visible = getPosts(sid).filter((p) => {
        if (p.status === "scheduled") return false;
        if (draftsFilter === "needs_fixes" && p.status !== "needs_fixes") return false;
        if (draftsNetwork !== "all" && p.network !== draftsNetwork) return false;
        return true;
      });
      if (event.target.checked) {
        for (const p of visible) selectedDraftIds.add(p.id);
      } else {
        for (const p of visible) selectedDraftIds.delete(p.id);
      }
      renderPanel();
      return;
    }
  });
  el.addEventListener("input", (event) => {
    // --- V1 brief panel inputs ---
    if (event.target.matches("[data-brief-name]")) {
      contextBriefConfig?.onName?.(event.target.value);
      const btn = el.querySelector("[data-brief-save]");
      if (btn) {
        const shouldDisable = !event.target.value.trim();
        if (shouldDisable && !btn.hasAttribute("disabled")) btn.setAttribute("disabled", "");
        else if (!shouldDisable && btn.hasAttribute("disabled")) btn.removeAttribute("disabled");
      }
      return;
    }
    if (event.target.matches("[data-brief-summary]")) {
      // Pass-through without re-render so the textarea keeps focus.
      contextBriefConfig?.onAnswer?.("businessSummary", event.target.value);
      return;
    }
    if (event.target.matches("[data-brief-voice-input]")) {
      // Voice-profile subsection textarea — pass-through without re-render.
      contextBriefConfig?.onVoiceProfileChange?.(event.target.dataset.briefVoiceInput, event.target.value);
      return;
    }
    if (event.target.matches("[data-brief-cta-label]")) {
      // CTA label edit in manage panel — mutate draft without
      // re-rendering so the input keeps focus mid-type.
      contextBriefConfig?.onCtaUpdate?.(Number(event.target.dataset.briefCtaLabel), "label", event.target.value);
      return;
    }
    if (event.target.matches("[data-brief-cta-url]")) {
      // CTA URL edit in manage panel — same pass-through-without-render.
      contextBriefConfig?.onCtaUpdate?.(Number(event.target.dataset.briefCtaUrl), "url", event.target.value);
      return;
    }
  });
  // Enter inside the "Other…" text input on a chip-multi-add question
  // appends the chip — same affordance as clicking the + button.
  el.addEventListener("keydown", (event) => {
    // V1 brief panel — Enter-to-add affordance on Other inputs.
    const briefOtherInput = event.target.matches("[data-brief-other-input]") ? event.target : null;
    if (briefOtherInput && event.key === "Enter") {
      event.preventDefault();
      const field = briefOtherInput.dataset.briefOtherInput;
      const v = briefOtherInput.value.trim();
      if (!v) return;
      contextBriefConfig?.onAddOther?.(field, v);
    }
  });
  // Inline-edit shortcuts — scoped to the active editor.
  // Esc cancels (and stops propagation so the document handler below
  // doesn't also close the panel) ; Cmd/Ctrl+Enter saves.
  el.addEventListener("keydown", (event) => {
    if (!canDraftInlineEdit() || !editingPostId) return;
    const editor = event.target.closest(`[data-post-editor="${editingPostId}"]`);
    if (!editor) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit(editingPostId);
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitEdit(editingPostId);
    }
  });
  // Focus moving outside the panel (Tab, click on topbar, etc.) commits
  // any in-progress edit.
  document.addEventListener("focusin", (event) => {
    if (!canDraftInlineEdit() || !editingPostId) return;
    if (el.contains(event.target)) return;
    commitEdit(editingPostId);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Escape first dismisses an open source kebab menu; only closes the
    // panel if no menu is open.
    if (document.querySelector(".rpanel-sources__more-menu:not([hidden])")) {
      closeAllSourceMenus();
      return;
    }
    if (state.mode) closePanel();
  });
  // Click anywhere outside an open source kebab menu closes it.
  document.addEventListener("click", (event) => {
    if (event.target.closest(".rpanel-sources__more-wrap")) return;
    closeAllSourceMenus();
  });

  // Lot 21 — re-render the Drafts view when the active session's posts
  // store mutates (per-card duplicate / delete / image attach). The
  // store's subscribe is per-session, so we re-bind whenever the active
  // session changes via `rebindPostsStore()`.
  rebindPostsStore();
  window.addEventListener("hashchange", rebindPostsStore);

  // Sources stream — sources are now per-session, so we re-bind the
  // subscription whenever the active session changes. The subscriber
  // covers both Sources mode (renders the per-session source list) and
  // the Ideas/Clips Outputs mode (Clips tab + auto-switch on first
  // clip batch).
  let unsubscribeSources = null;
  let lastSourcesSessionId = null;
  let lastClipCount = 0;
  function rebindSourcesSubscription() {
    const sid = activeSessionId();
    if (sid === lastSourcesSessionId) return;
    if (unsubscribeSources) {
      unsubscribeSources();
      unsubscribeSources = null;
    }
    lastSourcesSessionId = sid;
    lastClipCount = sid ? collectAllClips().length : 0;
    if (sid) {
      unsubscribeSources = subscribeSources(sid, () => {
        if (state.mode === "sources" || state.mode === "ideas") {
          const next = collectAllClips().length;
          if (state.mode === "ideas" && next > lastClipCount && lastClipCount === 0) {
            outputsView = "clips";
          }
          lastClipCount = next;
          renderPanel();
        }
      });
    }
    // Re-paint immediately on session change so the panel reflects the
    // new conversation's sources without waiting for the next mutation.
    if (state.mode === "sources" || state.mode === "ideas") {
      renderPanel();
    }
  }
  rebindSourcesSubscription();
  window.addEventListener("hashchange", rebindSourcesSubscription);

  // Auto-collapse the sidebar when the viewport shrinks enough that the
  // chat column would dip below CHAT_MIN_WIDTH_PX. rAF-debounced so
  // continuous drag-resize doesn't thrash setSidebarCollapsed.
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      maybeCollapseSidebar();
    });
  });

  // Restore panel mode from the URL hash (`?panel=drafts|ideas|sources`)
  // on boot, and re-sync on every hashchange so back/forward buttons +
  // session navigation honor the URL. The no-op guard in syncFromUrl()
  // breaks the write → hashchange → write loop.
  syncFromUrl();
  window.addEventListener("hashchange", syncFromUrl);
}

// Inline close button — placed as the last item of a mode's first control
// row so it aligns with the tabs / select on the row's flex baseline (no
// absolute positioning, no custom surface — a plain DS icon-button).
const RPANEL_CLOSE_INLINE = `
  <button
    type="button"
    class="ap-icon-button transparent rpanel-row-close"
    data-rpanel-close
    aria-label="Close panel"
    title="Close panel (Esc)"
  ><i class="ap-icon-close"></i></button>
`;

function renderPanel() {
  const el = document.getElementById(PANEL_ID);
  if (!el) return;
  // Lot 17.c — toggle the .is-right-panel-open class on the app shell so
  // the main content column reserves space for the panel instead of
  // sitting underneath it. CSS in components/right-panel.css handles the
  // padding-right transition.
  const shell = document.getElementById("appShell");
  if (shell) {
    shell.classList.toggle("is-right-panel-open", !!state.mode);
  }
  if (!state.mode) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  // No standalone title bar — the active mode is already named by the
  // highlighted topbar pill (and, inside the panel, by each mode's own
  // tabs/header row). We only compute a label here to keep the panel
  // landmark's accessible name in sync. The close affordance is a single
  // floating control pinned to the panel's top-right corner across modes.
  let titleText = "Ideas";
  if (state.mode === "drafts") {
    titleText = "Drafts";
  } else if (state.mode === "sources") {
    titleText = "Sources";
  } else if (state.mode === "context-brief") {
    if (contextBriefConfig?.mode === "read") {
      const ctx = contextBriefConfig.getCtx?.();
      titleText = ctx?.name || "Playbook";
    } else {
      const draft = contextBriefConfig?.getDraft?.();
      titleText = draft?.name?.trim() || "Define your Playbook";
    }
  }
  // The context-brief view manages its own scrolling body + sticky footer
  // (so Save sits flush at the bottom). Drafts/Ideas/Sources keep the
  // historical .app-right-panel__body wrapper.
  const bodyHtml =
    state.mode === "context-brief"
      ? renderContextBriefView()
      : `<div class="app-right-panel__body">${
          state.mode === "drafts"
            ? renderDraftsView()
            : state.mode === "sources"
              ? renderSourcesView()
              : renderIdeasView()
        }</div>`;

  // Preserve the body's scrollTop across re-renders so flipping a filter
  // chip or selecting a draft doesn't yank the user back to the top of
  // a long list. Keyed by mode so each tab gets its own remembered
  // position; switching modes intentionally restarts at the top.
  const previousBody = el.querySelector(".app-right-panel__body");
  const previousScroll = previousBody?.scrollTop || 0;
  const previousMode = el.dataset.rpanelLastMode;

  el.dataset.rpanelLastMode = state.mode;
  // Keep the aside's accessible name in sync with the active mode so
  // screen reader users can identify the panel from the landmark list.
  el.setAttribute("aria-label", `${titleText} panel`);
  el.innerHTML = html`
    <div
      class="app-right-panel__resize"
      data-rpanel-resize
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize"
    ></div>
    ${
      // List modes render the close inline in their first control row (so
      // it shares the row's flex baseline with the tabs / select). The
      // context-brief has no such row + its content is centred, so it gets
      // the corner-pinned close instead.
      state.mode === "context-brief"
        ? `<button
             type="button"
             class="ap-icon-button transparent app-right-panel__close"
             data-rpanel-close
             aria-label="Close panel"
             title="Close panel (Esc)"
           ><i class="ap-icon-close"></i></button>`
        : ""
    }
    ${raw(bodyHtml)}
  `;

  if (previousMode === state.mode && previousScroll > 0) {
    const nextBody = el.querySelector(".app-right-panel__body");
    if (nextBody) {
      requestAnimationFrame(() => {
        nextBody.scrollTop = previousScroll;
      });
    }
  }
}

// --- Resize handle -----------------------------------------------------

// Wipe any legacy persisted width left over from before the
// (viewport − sidebar) / 2 formula. Pre-formula users had their
// custom width in localStorage ; if we honored it the panel would
// keep ignoring the formula on every reload.
function clearLegacyPanelWidth() {
  try {
    localStorage.removeItem(LEGACY_PANEL_WIDTH_KEY);
  } catch (_) {
    // localStorage can throw in private mode / sandboxed contexts —
    // not worth blocking init over.
  }
}

// Drop any inline runtime override on the shell so the next render
// resolves the grid column through the formula default. Called on
// every "fresh open" (state.mode transition from null → something).
// The mode-swap path (e.g. Ideas → Drafts) intentionally keeps the
// override so a user's in-session resize survives the swap.
function resetPanelWidthOverride() {
  const shell = document.getElementById("appShell");
  if (!shell) return;
  shell.style.removeProperty("--app-right-panel-width-runtime");
}

// Drag-to-resize handler bound on the panel root. Tracks mousemove on
// document (not on the handle) so the cursor can leave the 4px strip
// without dropping the drag — same pattern as standard split-pane
// implementations.
let resizeDragging = false;
function startResizeDrag(event) {
  event.preventDefault();
  resizeDragging = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onResizeDrag);
  document.addEventListener("mouseup", endResizeDrag);
}

function onResizeDrag(event) {
  if (!resizeDragging) return;
  const shell = document.getElementById("appShell");
  if (!shell) return;
  const next = Math.round(window.innerWidth - event.clientX);
  const max = Math.max(PANEL_MIN_WIDTH, window.innerWidth - PANEL_MAX_RIGHT_GAP);
  const clamped = Math.min(max, Math.max(PANEL_MIN_WIDTH, next));
  shell.style.setProperty("--app-right-panel-width-runtime", `${clamped}px`);
}

function endResizeDrag() {
  if (!resizeDragging) return;
  resizeDragging = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  document.removeEventListener("mousemove", onResizeDrag);
  document.removeEventListener("mouseup", endResizeDrag);
  // No persistence — the override lives on shell.style until the panel
  // closes and reopens, at which point the formula reasserts.
}

// --- Drafts mode (Lot 21 — rich PostCard feed) -------------------------
//
// Source-of-truth shifted from the per-batch `message.drafts` payload to
// the durable per-session `posts-store`. Every post the user has ever
// drafted in a session lives there ; the panel reads + filters that list
// and renders rich PostCards (cf. `post-card.js`). Per-card actions
// (rewrite / schedule / duplicate / delete / generate image) wire
// directly to posts-store mutations + the relevant modals.

// Resolve the active session's id from the URL — the right-panel always
// reflects the route, regardless of which assistant message kicked it
// open. Falls back to the activeBatchRef session when the URL doesn't
// match a session route.
function activeSessionId() {
  const m = /^\/session\/([^/?]+)/.exec(getPath());
  if (m) return m[1];
  return state.activeBatchRef?.sessionId || null;
}

// Re-bind posts-store subscription when the active session changes
// (route hashchange) or on first init. Keeps the panel reactive without
// leaking listeners across sessions.
let unsubscribePosts = null;
let lastPostsSubscriptionSessionId = null;
function rebindPostsStore() {
  const sid = activeSessionId();
  if (sid === lastPostsSubscriptionSessionId) return;
  if (unsubscribePosts) {
    unsubscribePosts();
    unsubscribePosts = null;
  }
  lastPostsSubscriptionSessionId = sid;
  if (sid) {
    unsubscribePosts = subscribePostsStore(sid, () => {
      if (state.mode === "drafts") renderPanel();
    });
  }
}

function renderDraftsView() {
  const inlineEdit = canDraftInlineEdit();
  if (!inlineEdit && editingPostId) {
    editingPostId = null;
    editingOriginal = null;
  }
  const sid = activeSessionId();
  const allPosts = sid ? getPosts(sid) : [];
  if (!allPosts.length) return renderDraftsEmpty();

  // Counts per status / per network — drive the filter rail badges.
  const filterCounts = {
    all: allPosts.length,
    needs_fixes: allPosts.filter((p) => p.status === "needs_fixes").length,
    scheduled: allPosts.filter((p) => p.status === "scheduled").length,
  };
  const networkCounts = {
    all: allPosts.length,
    linkedin: allPosts.filter((p) => p.network === "linkedin").length,
    twitter: allPosts.filter((p) => p.network === "twitter").length,
  };

  // Apply both filter axes.
  const filtered = allPosts.filter((p) => {
    if (draftsFilter === "needs_fixes" && p.status !== "needs_fixes") return false;
    if (draftsFilter === "scheduled" && p.status !== "scheduled") return false;
    if (draftsNetwork !== "all" && p.network !== draftsNetwork) return false;
    return true;
  });

  // Filter header — status is the primary axis (which view of the list
  // you're looking at) so it uses the DS .ap-tabs component with
  // .ap-counter badges, matching the Outputs Ideas|Clips tabs. Network
  // is a secondary refinement, so it sits on the trailing edge as a
  // single DS .ap-select (details/summary). Both are first-class DS
  // controls — no native <select> form input, no ad-hoc filter buttons.
  const statusTab = (id, label, count) => {
    const active = draftsFilter === id;
    return `
      <button
        type="button"
        class="ap-tabs-tab ${active ? "active" : ""}"
        data-rpanel-drafts-filter="${id}"
        role="tab"
        aria-selected="${active}"
      >
        <span>${label}</span>
        <span class="ap-counter normal ${active ? "blue" : "grey"}">${count}</span>
      </button>
    `;
  };

  const networkMeta = {
    all: { icon: "ap-icon-web", label: "All networks", count: networkCounts.all },
    linkedin: { icon: "ap-icon-linkedin-official", label: "LinkedIn", count: networkCounts.linkedin },
    twitter: { icon: "ap-icon-twitter-official", label: "X", count: networkCounts.twitter },
  };
  const currentNetwork = networkMeta[draftsNetwork] || networkMeta.all;

  const networkOption = (id) => {
    const meta = networkMeta[id];
    const selected = draftsNetwork === id;
    return `
      <div class="ap-select-option ${selected ? "selected" : ""}" data-rpanel-drafts-network="${id}">
        <i class="${meta.icon} ap-select-option-icon"></i>
        <span class="ap-select-option-text">${meta.label} (${meta.count})</span>
        ${selected ? `<i class="ap-icon-check ap-select-option-check"></i>` : ""}
      </div>
    `;
  };

  const filtersBar = `
    <div class="rpanel-drafts__filters">
      <div class="ap-tabs rpanel-drafts__statustabs">
        <div class="ap-tabs-nav" role="tablist" aria-label="Filter drafts by status">
          ${statusTab("all", "All drafts", filterCounts.all)}
          ${statusTab("needs_fixes", "Needs fixes", filterCounts.needs_fixes)}
          ${statusTab("scheduled", "Scheduled", filterCounts.scheduled)}
        </div>
      </div>
      <details class="ap-select rpanel-drafts__network">
        <summary class="ap-select-trigger" aria-label="Filter drafts by network">
          <span class="ap-select-value">
            <i class="${currentNetwork.icon} ap-select-inline-icon"></i> ${currentNetwork.label}
          </span>
          <i class="ap-icon-chevron-down ap-select-arrow"></i>
        </summary>
        <div class="ap-select-dropdown">
          <div class="ap-select-options">
            ${networkOption("all")}
            ${networkOption("linkedin")}
            ${networkOption("twitter")}
          </div>
        </div>
      </details>
      ${RPANEL_CLOSE_INLINE}
    </div>
  `;

  // FIND-B5: align the no-match state with the rich `No drafts yet`
  // pattern just below — icon + title + sub + Clear filters CTA. The
  // CTA resets both filter axes through data-rpanel-drafts-clear so the
  // rail buttons and state mutation stay in lockstep.
  // Multi-select — surface schedulable drafts only (not already-
  // scheduled). Keep the selection set in sync with what's actually
  // visible so a hidden draft can't ghost-affect the bulk CTA.
  const schedulableIds = new Set(allPosts.filter((p) => p.status !== "scheduled").map((p) => p.id));
  for (const id of Array.from(selectedDraftIds)) {
    if (!schedulableIds.has(id)) selectedDraftIds.delete(id);
  }
  const visibleSchedulable = filtered.filter((p) => p.status !== "scheduled");
  const allVisibleSelected =
    visibleSchedulable.length > 0 && visibleSchedulable.every((p) => selectedDraftIds.has(p.id));
  const selectedCount = selectedDraftIds.size;

  const feed = filtered.length
    ? filtered
        .map((p) =>
          renderPostCard(p, {
            editing: p.id === editingPostId,
            inlineEdit,
            selectable: p.status !== "scheduled",
            selected: selectedDraftIds.has(p.id),
          }),
        )
        .join("")
    : `<div class="app-right-panel__empty">
         <div class="app-right-panel__empty-icon"><i class="ap-icon-search"></i></div>
         <div class="app-right-panel__empty-title">No drafts match this filter</div>
         <div class="app-right-panel__empty-sub">Try another filter, or clear the current one.</div>
         <div class="app-right-panel__empty-action">
           <button type="button" class="ap-button stroked grey" data-rpanel-drafts-clear>Clear filters</button>
         </div>
       </div>`;

  // "Select all" pill — sits above the feed, only visible when there are
  // schedulable drafts in the current filter. Uses an indeterminate
  // checkbox visual when some-but-not-all of the visible drafts are
  // selected, matching the DS .ap-checkbox-container.indeterminate state.
  const someVisibleSelected = visibleSchedulable.some((p) => selectedDraftIds.has(p.id));
  const selectAllIndeterminate = someVisibleSelected && !allVisibleSelected;
  const selectAllBar = visibleSchedulable.length
    ? `
      <div class="rpanel-drafts__selectbar">
        <label class="ap-checkbox-container ${selectAllIndeterminate ? "indeterminate" : ""}" aria-label="Select all visible drafts">
          <input type="checkbox" data-rpanel-drafts-select-all ${allVisibleSelected ? "checked" : ""} />
          <i></i>
          <span>${allVisibleSelected ? "Deselect all" : "Select all"}</span>
        </label>
        <span class="rpanel-drafts__selectbar-meta">${selectedCount} of ${schedulableIds.size} selected</span>
      </div>
    `
    : "";

  // Sticky bulk-action bar — anchored at the bottom of the feed when 1+
  // draft is selected. Clear selection · Delete (confirmed) · Schedule CTA.
  const draftWord = selectedCount === 1 ? "draft" : "drafts";
  const bulkBar = selectedCount
    ? `
      <div class="rpanel-drafts__bulkbar" role="region" aria-label="Bulk actions">
        <div class="rpanel-drafts__bulkbar-label">${selectedCount} selected</div>
        <div class="rpanel-drafts__bulkbar-actions">
          <button type="button" class="ap-button ghost grey" data-rpanel-drafts-bulk-clear>
            Clear
          </button>
          <button type="button" class="ap-button primary orange" data-rpanel-drafts-bulk-schedule>
            <i class="ap-icon-calendar" aria-hidden="true"></i>
            Schedule ${selectedCount} ${draftWord}
          </button>
          <button type="button" class="ap-icon-button stroked red" data-rpanel-drafts-bulk-delete aria-label="Delete ${selectedCount} ${draftWord}">
            <i class="ap-icon-trash" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `
    : "";

  return html`
    <div class="rpanel-drafts ${selectedCount ? "has-selection" : ""}">
      ${raw(filtersBar)}
      <div class="posts__feed rpanel-drafts__feed">${raw(selectAllBar)} ${raw(feed)} ${raw(bulkBar)}</div>
    </div>
  `;
}

function renderDraftsEmpty() {
  return html`
    <div class="app-right-panel__empty">
      <div class="app-right-panel__empty-icon"><i class="ap-icon-pen"></i></div>
      <div class="app-right-panel__empty-title">No drafts yet</div>
      <div class="app-right-panel__empty-sub">
        Ask Archie for a batch — drafts will land here ready to review and schedule.
      </div>
    </div>
  `;
}

// --- Per-card action handlers ------------------------------------------

function onPostRewrite(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  // draft-rewrite.js owns the full visual flow: ghost skeleton →
  // streaming → commit. Loaded lazily so the rewrite code is only
  // pulled in when the user actually triggers a regen.
  import("../draft-rewrite.js?v=2").then(({ startRewrite }) => {
    startRewrite(sid, postId);
  });
}

function onPostSchedule(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const post = getPosts(sid).find((p) => p.id === postId);
  if (!post) return;
  openScheduleModal({
    posts: [post],
    onConfirm: (slots) => {
      // Mark the post scheduled in-place — the store doesn't have a
      // dedicated mutator yet, so we mutate the object directly. Future
      // refactor: posts-store.markScheduled(sid, postId, label).
      const slot = slots && slots[0];
      post.status = "scheduled";
      post.scheduledForLabel = slot ? formatScheduledLabel(slot.when) : post.scheduledForLabel || "later";
      renderPanel();
    },
  });
}

// Bulk delete — confirm-modal gate (destructive, so no silent removal),
// then drop every selected draft. Snapshots each post with its original
// index so the toast Undo can restore the whole batch in place.
function onBulkDelete() {
  const sid = activeSessionId();
  if (!sid) return;
  const snapshot = getPosts(sid)
    .map((post, idx) => ({ post, idx }))
    .filter(({ post }) => selectedDraftIds.has(post.id));
  if (snapshot.length === 0) return;
  const count = snapshot.length;
  const draftWord = count === 1 ? "draft" : "drafts";
  openConfirmModal({
    title: `Delete ${count} ${draftWord}?`,
    body: `${count === 1 ? "This draft" : `These ${count} drafts`} will be removed from the session. You can undo right after.`,
    confirmLabel: `Delete ${count} ${draftWord}`,
    danger: true,
    onConfirm: () => {
      for (const { post } of snapshot) removePost(sid, post.id);
      selectedDraftIds.clear();
      renderPanel();
      import("./toast.js?v=20").then(({ showToast }) => {
        showToast(`${count} ${draftWord} deleted`, {
          action: {
            label: "Undo",
            onClick: () => {
              // Re-insert in ascending original index so positions line up.
              for (const { post, idx } of snapshot) insertPost(sid, post, idx);
              renderPanel();
            },
          },
        });
      });
    },
  });
}

// Bulk schedule — opens the modal seeded with every selected draft. On
// confirm, each post is marked scheduled with its per-slot label and
// the selection is cleared so the bar disappears.
function onBulkSchedule() {
  const sid = activeSessionId();
  if (!sid) return;
  const sessionPosts = getPosts(sid);
  const selected = sessionPosts.filter((p) => selectedDraftIds.has(p.id) && p.status !== "scheduled");
  if (selected.length === 0) return;
  openScheduleModal({
    posts: selected,
    onConfirm: (slots) => {
      const byPostId = new Map((slots || []).map((s) => [s.postId, s.when]));
      for (const p of selected) {
        const when = byPostId.get(p.id);
        p.status = "scheduled";
        p.scheduledForLabel = when ? formatScheduledLabel(when) : p.scheduledForLabel || "later";
      }
      selectedDraftIds.clear();
      renderPanel();
    },
  });
}

// Compact label shown above the card when a post is scheduled. Same
// shape as the seeded labels ("Thu · 9:00") so the in-feed scheduled
// notice keeps a consistent visual weight regardless of the source.
function formatScheduledLabel(ts) {
  const d = new Date(ts);
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

function onPostDuplicate(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const post = getPosts(sid).find((p) => p.id === postId);
  if (!post) return;
  addPostDraft(sid, {
    network: post.network,
    text: [...(post.text || [])],
    hashtags: [...(post.hashtags || [])],
  });
  import("./toast.js?v=20").then(({ showToast }) => showToast("Draft duplicated"));
}

function onPostDelete(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const idx = getPosts(sid).findIndex((p) => p.id === postId);
  if (idx < 0) return;
  selectedDraftIds.delete(postId);
  const removed = removePost(sid, postId);
  if (!removed) return;
  import("./toast.js?v=20").then(({ showToast }) => {
    showToast("Draft deleted", {
      action: {
        label: "Undo",
        onClick: () => insertPost(sid, removed, idx),
      },
    });
  });
}

function onPostImage(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  // generate-image-modal.open(postId, onUse) — onUse re-renders the
  // panel so the new image lands in the card immediately.
  openGenerateImageModal(postId, () => renderPanel());
}

// --- Inline edit handlers ---------------------------------------------

function startEdit(postId) {
  if (!canDraftInlineEdit()) return;
  if (editingPostId === postId) return;
  if (editingPostId) commitEdit(editingPostId); // auto-save the previous card
  const sid = activeSessionId();
  const post = sid && getPosts(sid).find((p) => p.id === postId);
  if (!post) return;
  editingPostId = postId;
  editingOriginal = {
    text: [...(post.text || [])],
    hashtags: [...(post.hashtags || [])],
    cta: post.cta || "",
  };
  renderPanel();
  // Focus the editor and place caret at the end of the body.
  requestAnimationFrame(() => {
    const editor = document.querySelector(`[data-post-editor="${postId}"]`);
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

function commitEdit(postId) {
  if (!canDraftInlineEdit()) return;
  if (editingPostId !== postId) return;
  const sid = activeSessionId();
  const editor = document.querySelector(`[data-post-editor="${postId}"]`);
  if (!sid || !editor) {
    editingPostId = null;
    editingOriginal = null;
    renderPanel();
    return;
  }
  const parsed = parseEditorBody(editor.innerText);
  const original = editingOriginal;
  const changed =
    JSON.stringify(parsed.text) !== JSON.stringify(original.text) ||
    JSON.stringify(parsed.hashtags) !== JSON.stringify(original.hashtags) ||
    parsed.cta !== original.cta;
  editingPostId = null;
  editingOriginal = null;
  if (changed) {
    updatePostContent(sid, postId, parsed); // notify → posts-store subscriber re-renders
  } else {
    renderPanel(); // no notify path → render manually
  }
}

function cancelEdit(postId) {
  if (!canDraftInlineEdit()) return;
  if (editingPostId !== postId) return;
  editingPostId = null;
  editingOriginal = null;
  renderPanel();
}

// Reverse of post-card.js#serializeBody — split blank-line-separated
// blocks, find the hashtag-only block (if any), extract its tags into
// the hashtags array. Everything else becomes text[]. CTA folds into
// text[] as a regular paragraph (accepted per spec — only hashtags need
// to re-style on save).
//
// The hashtag block can sit anywhere among the blocks (typically last
// in social-post convention, but a CTA may follow it). Scanning all
// blocks instead of walking from the end keeps the round-trip robust
// against either ordering.
function parseEditorBody(raw) {
  const blocks = String(raw)
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const text = [];
  let hashtags = [];
  for (const block of blocks) {
    if (!hashtags.length && /^(#\S+\s*)+$/.test(block)) {
      hashtags = block
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.replace(/^#/, ""));
    } else {
      text.push(block);
    }
  }
  return { text, hashtags, cta: "" };
}

// --- Ideas mode -------------------------------------------------------

// Sources mode view — list of source rows for the active session + a
// trailing "+ Attach" button. Each row carries kind icon, filename,
// signal/idea-count meta, and per-row Open + Detach actions. The list
// reads from sources-stream's per-session map and re-renders on every
// notify from the session's sources subscription bound at init time.
function renderSourcesView() {
  const sid = activeSessionId();
  if (!sid) {
    return `
      <div class="rpanel-sources">
        <div class="app-right-panel__empty">
          <div class="app-right-panel__empty-icon"><i class="ap-icon-file"></i></div>
          <div class="app-right-panel__empty-title">Open a chat</div>
          <div class="app-right-panel__empty-sub">Sources attach to a chat. Start or open one to manage its sources.</div>
        </div>
      </div>
    `;
  }
  const sources = getStreamSources(sid);
  const rows = sources.map((src) => renderSourceRow(src)).join("");
  const head = `
    <div class="rpanel-sources__head">
      <div class="rpanel-sources__head-text">
        <div class="rpanel-sources__count">${sources.length} source${sources.length === 1 ? "" : "s"} in this chat</div>
        <div class="rpanel-sources__sub muted">These sources feed this chat's ideas.</div>
      </div>
      <button type="button" class="ap-button stroked grey" data-rpanel-sources-attach>
        <i class="ap-icon-plus"></i>
        <span>Attach source</span>
      </button>
      ${RPANEL_CLOSE_INLINE}
    </div>
  `;
  const liveBlock = renderLiveConnectors();
  if (sources.length === 0) {
    return `
      <div class="rpanel-sources">
        ${head}
        ${liveBlock}
        <div class="app-right-panel__empty rpanel-sources__empty">
          <div class="app-right-panel__empty-icon"><i class="ap-icon-file"></i></div>
          <div class="app-right-panel__empty-title">No sources yet</div>
          <div class="app-right-panel__empty-sub">Attach a file or pick from a connector to start.</div>
          <div class="app-right-panel__empty-action">
            <button type="button" class="ap-button primary orange" data-rpanel-sources-attach>
              <i class="ap-icon-plus"></i>
              <span>Attach a source</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="rpanel-sources">
      ${head}
      ${liveBlock}
      <div class="rpanel-sources__list">${rows}</div>
    </div>
  `;
}

// Connected connectors surface as LIVE sources at the top of the Sources view:
// nothing is imported — clicking Ask queries the connector live in chat
// (simulated MCP, see connector-ask.js). Distinct from the frozen file sources
// listed below.
function renderLiveConnectors() {
  const connected = getConnectedConnectors();
  const rows = connected
    .map(
      (c) => `
      <div class="rpanel-sources__row rpanel-live-connector" data-connector-id="${escapeAttr(c.id)}">
        <div class="rpanel-sources__card-head">
          <span class="rpanel-live-connector__logo" aria-hidden="true">${renderConnectorLogo(c, 24)}</span>
          <div class="rpanel-sources__row-name" title="${escapeAttr(c.name)}">${escapeText(c.name)}</div>
          <span class="ap-tag blue rpanel-live-connector__badge">Live</span>
          <button
            type="button"
            class="ap-button ghost blue rpanel-sources__row-mention"
            data-rpanel-ask-connector="${escapeAttr(c.id)}"
            aria-label="Ask ${escapeAttr(c.name)} in chat"
            title="Ask in chat"
          >
            <i class="ap-icon-single-chat-bubble"></i>
            <span>Ask</span>
          </button>
        </div>
      </div>`,
    )
    .join("");
  // Always rendered (even with 0 connected) so the "Connect" entry point is
  // available right here — opens the connectors modal scoped to this chat.
  const body = connected.length
    ? `<div class="rpanel-sources__list rpanel-live-connectors__list">${rows}</div>`
    : `<div class="rpanel-live-connectors__empty muted">Connect a tool to query its content live in chat.</div>`;
  return `
    <div class="rpanel-live-connectors">
      <div class="rpanel-live-connectors__head">
        <span class="rpanel-live-connectors__title">Live connectors</span>
        ${connected.length ? `<span class="ap-counter normal grey">${connected.length}</span>` : ""}
        <button type="button" class="ap-button ghost blue rpanel-live-connectors__manage" data-rpanel-open-connectors>
          <i class="ap-icon-plus"></i><span>Connect</span>
        </button>
      </div>
      ${body}
    </div>`;
}

const SOURCE_KIND_ICON = {
  PDF: "ap-icon-file--pdf",
  Word: "ap-icon-file--text",
  Text: "ap-icon-file--text",
  Video: "ap-icon-file--video",
  Audio: "ap-icon-file",
  Image: "ap-icon-file--image",
  URL: "ap-icon-link",
};

// Close every open source-card kebab dropdown (except `except`), resetting the
// trigger's aria-expanded. One menu open at a time.
function closeAllSourceMenus(except) {
  document.querySelectorAll(".rpanel-sources__more-menu:not([hidden])").forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    const trigger = document.querySelector(`[aria-controls="${menu.id}"]`);
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  });
}

function renderSourceRow(src) {
  const icon = SOURCE_KIND_ICON[src.kind] || "ap-icon-file";
  const isProcessing = src.status !== "Processed";
  // Only surface a status pill while the source is in-flight. Once
  // Processed, the card stays uncluttered. Mermaid-tinted pill mirrors
  // source-card's processing chip so the "AI is working" cue stays
  // consistent across surfaces.
  const stageLabel = isProcessing ? src.stage || "Processing" : "";
  const statusEl = isProcessing
    ? `<span class="source-card__processing-pill rpanel-sources__row-status" role="status">
         <i class="ap-icon-sparkles-mermaid"></i>
         <span class="source-card__processing-pill-label">${escapeText(stageLabel)}…</span>
       </span>`
    : "";

  // Ideas this source produced — each title is a link into the Outputs ›
  // Ideas tab (focuses + pulses that card). Resolved from the same IDEAS
  // list the Ideas tab renders, so every link has a live target. Mirrors
  // the idea/clip card grammar (card content → footer actions).
  const sourceIdeas = IDEAS.filter((i) => Array.isArray(i.sourceIds) && i.sourceIds.includes(src.id));
  const ideasList =
    !isProcessing && sourceIdeas.length
      ? `<ul class="rpanel-sources__ideas">
          ${sourceIdeas
            .map(
              (i) => `
              <li>
                <button type="button" class="rpanel-sources__idea-link" data-rpanel-source-idea="${escapeAttr(i.id)}" title="${escapeAttr(i.title)}">
                  <i class="ap-icon-sparkles rpanel-sources__idea-icon" aria-hidden="true"></i>
                  <span class="rpanel-sources__idea-title">${escapeText(i.title)}</span>
                  ${i.kind ? `<span class="rpanel-sources__idea-kind muted">${escapeText(i.kind)}</span>` : ""}
                  <i class="ap-icon-chevron-right rpanel-sources__idea-chevron" aria-hidden="true"></i>
                </button>
              </li>`,
            )
            .join("")}
        </ul>`
      : "";

  const mentionBtn = !isProcessing
    ? `<button
        type="button"
        class="ap-button ghost blue rpanel-sources__row-mention"
        data-rpanel-mention-source="${src.id}"
        aria-label="Mention ${escapeAttr(src.filename)} in composer"
        title="Mention"
      >
        <i class="ap-icon-at"></i>
        <span>Mention</span>
      </button>`
    : "";
  // Kebab menu (…) on the head row, to the right of Mention. DS
  // .ap-action-dropdown; one menu open at a time (see closeAllSourceMenus +
  // the document listeners in init). Always available — even while
  // processing.
  const menuId = `src-more-${src.id}`;
  const moreMenu = `
    <div class="rpanel-sources__more-wrap">
      <button
        type="button"
        class="ap-icon-button transparent rpanel-sources__row-more"
        data-rpanel-source-more="${src.id}"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="${menuId}"
        aria-label="More actions for ${escapeAttr(src.filename)}"
        title="More actions"
      >
        <i class="ap-icon-more"></i>
      </button>
      <div id="${menuId}" class="ap-action-dropdown rpanel-sources__more-menu" role="menu" hidden>
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-rpanel-source-rename="${src.id}">
          <i class="ap-icon-pen"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Edit name</span>
            </div>
          </div>
        </button>
        <button type="button" role="menuitem" class="ap-action-dropdown-item" data-rpanel-source-reanalyze="${src.id}">
          <i class="ap-icon-refresh"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Reanalyze</span>
            </div>
          </div>
        </button>
        <button type="button" role="menuitem" class="ap-action-dropdown-item red-mode" data-rpanel-sources-detach="${src.id}">
          <i class="ap-icon-trash"></i>
          <div class="ap-action-dropdown-item-text">
            <div class="ap-action-dropdown-item-label-container">
              <span class="ap-action-dropdown-item-label">Delete source</span>
            </div>
          </div>
        </button>
      </div>
    </div>`;

  return `
    <div class="rpanel-sources__row" data-source-id="${src.id}">
      <div class="rpanel-sources__card-head">
        <span class="rpanel-sources__row-icon" aria-hidden="true"><i class="${icon}"></i></span>
        <div class="rpanel-sources__row-name" title="${escapeAttr(src.filename)}">${escapeText(src.filename)}</div>
        ${statusEl}
        ${mentionBtn}
        ${moreMenu}
      </div>
      ${ideasList}
    </div>
  `;
}

function renderIdeasView() {
  const ideaCount = IDEAS.length;
  const clips = collectAllClips();
  const clipCount = clips.length;
  const ideasActive = outputsView === "ideas";

  // Outputs tabs — Ideas | Clips. Always rendered so the user can
  // discover the Clips surface even when empty; the Clips tab carries
  // an empty state on its own when no clips have been extracted yet.
  const tabs = `
    <div class="ap-tabs rpanel-outputs__tabs">
      <div class="ap-tabs-nav">
        <button
          type="button"
          class="ap-tabs-tab ${ideasActive ? "active" : ""}"
          data-rpanel-outputs-tab="ideas"
          role="tab"
          aria-selected="${ideasActive}"
        >
          <span>Ideas</span>
          ${ideaCount > 0 ? `<span class="ap-counter normal ${ideasActive ? "blue" : "grey"}">${ideaCount}</span>` : ""}
        </button>
        <button
          type="button"
          class="ap-tabs-tab ${!ideasActive ? "active" : ""}"
          data-rpanel-outputs-tab="clips"
          role="tab"
          aria-selected="${!ideasActive}"
        >
          <span>Clips</span>
          ${clipCount > 0 ? `<span class="ap-counter normal ${!ideasActive ? "blue" : "grey"}">${clipCount}</span>` : ""}
        </button>
      </div>
      ${RPANEL_CLOSE_INLINE}
    </div>
  `;

  if (!ideasActive) {
    return html`
      <div class="rpanel-ideas">
        ${raw(tabs)}
        <div class="rpanel-ideas__body" data-rpanel-ideas-body>${raw(renderClipsList(clips))}</div>
      </div>
    `;
  }

  // Counts per kind for the filter chips — "All (12)" / "Stats (4)".
  const totalCount = IDEAS.length;
  const kindCounts = IDEA_KINDS.reduce((acc, k) => {
    acc[k.id] = k.id === "all" ? totalCount : IDEAS.filter((i) => i.kind === k.id).length;
    return acc;
  }, {});

  return html`
    <div class="rpanel-ideas">
      ${raw(tabs)}
      <div class="rpanel-ideas__head">
        <div class="rpanel-ideas__filters" role="tablist">
          ${raw(
            IDEA_KINDS.map(
              (k) => `
                <button
                  type="button"
                  class="ap-filter-chip"
                  data-rpanel-ideas-filter="${k.id}"
                  role="tab"
                  aria-pressed="${ideasFilter === k.id}"
                  aria-selected="${ideasFilter === k.id}"
                >
                  <span>${k.label}</span>
                  <span class="ap-filter-chip-count">${kindCounts[k.id]}</span>
                </button>
              `,
            ).join(""),
          )}
        </div>
      </div>
      <div class="rpanel-ideas__body" data-rpanel-ideas-body>${raw(renderIdeasList())}</div>
    </div>
  `;
}

// Walk all sources in the workspace and aggregate any attached clips with
// their source attribution so the unified panel knows where each clip
// came from. Returns a flat array of { clip, sourceName, sourceId }.
function collectAllClips() {
  const sid = activeSessionId();
  if (!sid) return [];
  const sources = getStreamSources(sid);
  const out = [];
  for (const src of sources) {
    if (!Array.isArray(src.clips) || src.clips.length === 0) continue;
    for (const clip of src.clips) {
      out.push({
        clip,
        sourceName: src.filename || "Source",
        sourceKind: src.kind || "Video",
        sourceId: src.id,
      });
    }
  }
  return out;
}

function renderClipsList(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return html`
      <div class="app-right-panel__empty rpanel-ideas__no-match">
        <div class="app-right-panel__empty-icon"><i class="ap-icon-file--video"></i></div>
        <div class="app-right-panel__empty-title">No clips yet</div>
        <div class="app-right-panel__empty-sub">
          Drop a video into the chat and pick <strong>Create clips</strong> to extract short segments here.
        </div>
      </div>
    `;
  }

  const sid = activeSessionId();
  const cards = entries
    .map(({ clip, sourceName, sourceKind }) =>
      renderClipCard(clip, {
        sourceName,
        sourceKind,
        sessionId: sid,
        feedback: getClipFeedback(clip.id),
        whyOpen: isClipWhyOpen(clip.id),
      }),
    )
    .join("");

  const selectedCount = entries.filter(({ clip }) => clipSelection.has(clip.id)).length;
  const footer =
    selectedCount > 0
      ? `
        <div class="rpanel-outputs__footer">
          <button type="button" class="ap-button mermaid" data-rpanel-clips-draft>
            <i class="ap-icon-sparkles"></i>
            <span>Draft posts from ${selectedCount} clip${selectedCount > 1 ? "s" : ""}</span>
          </button>
        </div>
      `
      : "";

  return `
    <div class="rpanel-outputs__clips">${cards}</div>
    ${footer}
  `;
}

function renderIdeasList() {
  // Order matches the seed array (newest-first by convention in mocks);
  // the active kind filter narrows the list.
  const sorted = IDEAS.filter((i) => ideasFilter === "all" || i.kind === ideasFilter);
  if (sorted.length === 0) {
    return html`
      <div class="app-right-panel__empty rpanel-ideas__no-match">
        <div class="app-right-panel__empty-icon"><i class="ap-icon-sparkles"></i></div>
        <div class="app-right-panel__empty-title">No ideas match</div>
        <div class="app-right-panel__empty-sub">Switch to a different kind, or pick All to broaden the list.</div>
        <div class="app-right-panel__empty-action">
          <button type="button" class="ap-button stroked grey" data-rpanel-ideas-clear>Clear filters</button>
        </div>
      </div>
    `;
  }

  return `<div class="rpanel-ideas__grid">${sorted.map((i) => renderIdeaCompact(i)).join("")}</div>`;
}

function renderIdeasBodyOnly() {
  const body = document.querySelector("[data-rpanel-ideas-body]");
  if (body) body.innerHTML = renderIdeasList();
}

// ── Card-level helper — thumbs feedback ─────────────────────────────
//
// Tracks the user's reaction per idea in a module-local Map so the
// state survives renders without leaking onto the seeded mock object.
// Clicking the same verdict again clears it (toggle off).

const ideaFeedback = new Map(); // ideaId → 'up' | 'down'

function getIdeaFeedback(ideaId) {
  return ideaFeedback.get(ideaId) || null;
}

function toggleIdeaFeedback(ideaId, verdict) {
  if (verdict !== "up" && verdict !== "down") return;
  const current = ideaFeedback.get(ideaId);
  if (current === verdict) ideaFeedback.delete(ideaId);
  else ideaFeedback.set(ideaId, verdict);
  renderIdeasBodyOnly();
}

// Per-idea collapse state for the "Why this idea" panel. Default
// collapsed so a long list of idea cards stays scannable; the user
// opts in per-card via the head toggle. Toggle persists for the
// lifetime of the module so re-renders don't reset user intent.
const ideaWhyOpen = new Map(); // ideaId → boolean

function isWhyOpen(ideaId) {
  const stored = ideaWhyOpen.get(ideaId);
  return stored === undefined ? false : stored;
}

function toggleWhyOpen(ideaId) {
  ideaWhyOpen.set(ideaId, !isWhyOpen(ideaId));
  renderIdeasBodyOnly();
}

// Per-clip feedback + Why-open state — mirrors the Idea card pattern.
// Both states are module-local mocks (no persistence). State Maps
// survive re-renders so a future full repaint reflects the user's
// choices; the in-place toggle helpers below mutate the DOM directly
// to keep the clips list's scroll position when the user is reacting
// in the middle of a long list.
const clipFeedback = new Map(); // clipId → 'up' | 'down'
const clipWhyOpen = new Map(); // clipId → boolean

function getClipFeedback(clipId) {
  return clipFeedback.get(clipId) || null;
}

function isClipWhyOpen(clipId) {
  const stored = clipWhyOpen.get(clipId);
  return stored === undefined ? false : stored;
}

// In-place feedback toggle — flips state Map AND updates both thumb
// buttons on the same card without re-rendering. Avoids the scroll
// jump a full panel re-render would cause.
function toggleClipFeedbackInPlace(clipId, verdict, clickedBtn) {
  if (verdict !== "up" && verdict !== "down") return;
  const current = clipFeedback.get(clipId);
  const nextVerdict = current === verdict ? null : verdict;
  if (nextVerdict === null) clipFeedback.delete(clipId);
  else clipFeedback.set(clipId, nextVerdict);

  const card = clickedBtn.closest(".clip-card");
  if (!card) return;
  const buttons = card.querySelectorAll("[data-rpanel-clip-feedback]");
  for (const btn of buttons) {
    const side = btn.dataset.verdict;
    const isActive = nextVerdict === side;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  }
}

// In-place "Why this clip" toggle — flips state Map AND mutates the
// section's open attribute, body hidden flag, chevron icon class, and
// aria-expanded. No re-render → scroll stays put.
function toggleClipWhyInPlace(clipId, headBtn) {
  const next = !isClipWhyOpen(clipId);
  clipWhyOpen.set(clipId, next);

  const section = headBtn.closest(".rpanel-ideas__why");
  if (section) section.setAttribute("data-why-open", next ? "true" : "false");
  headBtn.setAttribute("aria-expanded", next ? "true" : "false");
  const bodyId = headBtn.getAttribute("aria-controls");
  const body = bodyId ? document.getElementById(bodyId) : null;
  if (body) body.hidden = !next;
  const chevron = headBtn.querySelector(".rpanel-ideas__why-chevron");
  if (chevron) {
    chevron.classList.toggle("ap-icon-chevron-down", !next);
    chevron.classList.toggle("ap-icon-chevron-up", next);
  }
}

function renderIdeaCompact(idea) {
  // Resolve linked sources for the current session so the head shows real
  // filenames + per-kind icons. The shared renderer owns the markup; the
  // panel just feeds it the session sources + this card's feedback/why state.
  const sid = activeSessionId();
  const sessionSources = sid ? getStreamSources(sid) : [];
  return renderCompactIdeaCard(idea, sessionSources, {
    verdict: getIdeaFeedback(idea.id),
    whyOpen: isWhyOpen(idea.id),
    showMention: true,
  });
}

// Closes the panel and hands off to the session screen's inline-question
// picker: "How many drafts from this idea?". The picked count drives the
// usual draft-flow pipeline, so the user lands back on the chat surface
// with the picker mounted and ready to answer.
function useIdea(ideaId) {
  const idea = IDEAS.find((i) => i.id === ideaId);
  if (!idea) return;
  const sid = activeSessionId();
  if (!sid) return;
  import("../screens/session.js?v=187").then(({ askAngleQuestion }) => {
    askAngleQuestion(sid, ideaId);
  });
}

// Inject a hover-reveal "Refine with Archie" button into the opening
// `<section class="context-brief__section…">` tag of a card. Used in
// read mode only — see `canRefine` in `renderContextBriefSections`.
// The click is delegated through the panel's main click handler which
// routes the `data-brief-refine-field` value to `contextBriefConfig.
// onRefineField` (wired by callers like `context-builder.openRead`).
function withRefine(sectionHtml, fieldKey, canRefine) {
  if (!canRefine || !sectionHtml) return sectionHtml;
  const button = `<button type="button" class="context-brief__refine" data-brief-refine-field="${escapeAttr(fieldKey)}" title="Refine with Archie" aria-label="Refine with Archie"><i class="ap-icon-sparkles-mermaid"></i><span>Refine</span></button>`;
  // Inject right after the opening section tag (matches the section
  // with any compound class string — voice profile uses extra classes
  // alongside `context-brief__section`, and the new editorial zones
  // (`__hero`, `__personality`, `__voice-feature`, `__essentials`,
  // `__showcase`) open with their own root class instead of the
  // legacy card chrome).
  return sectionHtml.replace(
    /<section class="context-brief__(?:section|hero|personality|voice-feature|essentials|showcase)[^"]*">/,
    (match) => match + button,
  );
}

function escapeText(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return escapeText(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// --- V1 Brief panel ---------------------------------------------------

const COLOR_SWATCHES = ["orange", "blue", "green", "purple", "red", "yellow"];
// Archie's UI and AI generation are English-only today. Mirror of the list
// in src/playbook-view.js — re-add other languages here when shipped.
const LANGUAGE_OPTIONS = ["English"];
const TONE_FALLBACKS = [
  "Conversational & approachable",
  "Bold & opinionated",
  "Neutral & informative",
  "Playful & witty",
];
const STYLE_FALLBACKS = ["Educational with case studies", "Inspirational & aspirational", "Behind-the-scenes & human"];
const OBJECTIVE_FALLBACKS = ["Drive traffic", "Community engagement", "Thought leadership", "Customer retention"];
const ACTION_FALLBACKS = ["Visit the website", "Download a resource", "Join the community", "Contact sales"];

// Public renderer for the brief panel's three section groups (Audience /
// Voice profile / Branding) — extracted so surfaces outside the right
// panel can show the same content without duplicating the layout.
// Accepts a draft-shaped object
// (or a persisted Context normalized by readBriefFromCtx) plus a tiny
// options bag. Does NOT include the panel header, footer, or scroll
// container — pure section HTML.
export function renderBriefSections(d, { isRead = true, canRefine = false } = {}) {
  if (!d) return "";
  const chipProps = (cfg) => ({ ...cfg, isRead });
  // Persisted contexts may not have the suggestion arrays the chip
  // helpers expect — normalize via readBriefFromCtx when the shape
  // looks like a saved Context (no `suggestions` field).
  const draft = d.suggestions ? d : readBriefFromCtx(d) || d;
  return _renderBriefSectionsInner(draft, isRead, canRefine, chipProps);
}

// Internal: composes the five editorial zones (Hero / Personality grid /
// Voice feature / Essentials bar / Branding showcase) and joins them.
// Pulled out of `renderContextBriefView` so the public
// `renderBriefSections` can call the same code path.
function _renderBriefSectionsInner(d, isRead, canRefine, chipProps) {
  return [
    withRefine(renderBriefHero(d, isRead), "brief", canRefine),
    withRefine(renderBriefPersonalityGrid(d, isRead, chipProps), "brief", canRefine),
    withRefine(renderBriefVoiceFeature(d, isRead), "voice", canRefine),
    withRefine(renderBriefEssentialsBar(d, isRead), "cta", canRefine),
    withRefine(renderBriefBrandingShowcase(d, isRead), "branding", canRefine),
  ]
    .filter(Boolean)
    .join("");
}

// ── Editorial zone renderers ─────────────────────────────────────────
//
// Each zone owns a slice of the playbook data and emits a single
// `<section class="context-brief__<zone>">` so the `withRefine` helper
// can anchor the hover-reveal "Refine with Archie" pill to it. Empty
// zones return "" so the body collapses gracefully when context data
// is partial (legacy seeds, freshly-created drafts).

// Hero — identity strip (color dot + name + business summary as an
// editorial paragraph). Replaces the legacy intro + name + business
// summary cards. In edit mode the name becomes an input + color
// swatches inline, and the summary a textarea. The data attributes
// (`data-brief-name`, `data-brief-color`, `data-brief-summary`) are
// preserved verbatim — they are read by the panel-level input
// handlers (`right-panel.js` ~lines 836-851).
function renderBriefHero(d, isRead) {
  const name = d?.name || "";
  const colorValue = d?.color || "orange";
  const colorVar = `var(--ref-color-${colorValue === "blue" ? "electric-blue" : colorValue}-100)`;
  const summary = d?.businessSummary || "";

  if (isRead) {
    if (!name && !summary) return "";
    return `
      <section class="context-brief__hero" aria-label="Playbook identity">
        <div class="context-brief__hero-identity">
          <span
            class="context-brief__hero-color"
            style="background: ${colorVar};"
            aria-hidden="true"
          ></span>
          <h2 class="context-brief__hero-name">${escapeText(name)}</h2>
        </div>
        ${
          summary
            ? `
              ${d.websiteUrl ? `<p class="context-brief__hero-source"><i class="ap-icon-web"></i> ${escapeText(d.websiteUrl)}</p>` : ""}
              <p class="context-brief__hero-summary">${escapeText(summary)}</p>
            `
            : ""
        }
      </section>
    `;
  }

  // Edit mode — name input, inline color swatches, summary textarea.
  const swatches = COLOR_SWATCHES.map((c) => {
    const isSelected = c === colorValue;
    return `
      <button
        type="button"
        class="context-brief__color-swatch ${isSelected ? "is-selected" : ""}"
        data-brief-color="${c}"
        style="background: var(--ref-color-${c === "blue" ? "electric-blue" : c}-100);"
        aria-label="${c}"
        aria-pressed="${isSelected ? "true" : "false"}"
      ></button>
    `;
  }).join("");

  return `
    <section class="context-brief__hero" aria-label="Playbook identity">
      <div class="context-brief__hero-identity">
        <div class="ap-input-group context-brief__hero-name-input">
          <input
            type="text"
            data-brief-name
            value="${escapeAttr(name)}"
            placeholder="e.g. Acme · Q2 marketing"
            aria-label="Context name"
          />
        </div>
        <div class="context-brief__color-swatches context-brief__hero-swatches">${swatches}</div>
      </div>
      <div class="context-brief__hero-summary-wrap">
        <div class="ap-textarea-field resizable">
          <textarea
            data-brief-summary
            rows="4"
            placeholder="Describe your business in a few sentences…"
          >${escapeText(summary)}</textarea>
        </div>
      </div>
    </section>
  `;
}

// Personality grid — 2-column responsive grid that pairs the four chip
// groups thematically: Audience ↔ Content style (who + how), and
// Objective ↔ Content action (why + what next). Each cell reuses
// `renderBriefChips` and the existing `.context-brief__section` markup;
// CSS scoped to `.context-brief__personality .context-brief__section`
// strips the card chrome so the grid reads as one cohesive zone with
// hairline dividers.
function renderBriefPersonalityGrid(d, isRead, chipProps) {
  const cells = [
    renderBriefChips(
      chipProps({
        field: "audience",
        title: "Who is your primary audience?",
        hint: "Archie will tailor post topics and framing to speak directly to them.",
        fromWeb: true,
        suggestions: d.suggestions?.audience || [],
        fallback: [],
        values: d.audience || [],
        customs: d.customAdditions?.audience || [],
        otherPlaceholder: "Describe your audience…",
        warningCount: 0,
      }),
    ),
    renderBriefChips(
      chipProps({
        field: "contentStyle",
        title: "What content style fits your brand?",
        hint: "This guides the structure and format of every post Archie writes.",
        fromWeb: true,
        suggestions: d.suggestions?.contentStyle || [],
        fallback: STYLE_FALLBACKS,
        values: d.contentStyle || [],
        customs: d.customAdditions?.contentStyle || [],
        otherPlaceholder: "Describe your style…",
      }),
    ),
    renderBriefChips(
      chipProps({
        field: "objective",
        title: "What's your primary social media objective?",
        hint: "Archie will prioritize content angles that serve this goal.",
        fromWeb: true,
        suggestions: d.suggestions?.objective || [],
        fallback: OBJECTIVE_FALLBACKS,
        values: d.objective || [],
        customs: d.customAdditions?.objective || [],
        otherPlaceholder: "Describe your objective…",
      }),
    ),
    renderBriefChips(
      chipProps({
        field: "contentAction",
        title: "What action should your content drive?",
        hint: "Archie will include relevant CTAs aligned with this action.",
        fromWeb: true,
        suggestions: d.suggestions?.contentAction || [],
        fallback: ACTION_FALLBACKS,
        values: d.contentAction || [],
        customs: d.customAdditions?.contentAction || [],
        otherPlaceholder: "Describe the action…",
      }),
    ),
  ].filter(Boolean);

  if (cells.length === 0) return "";

  return `
    <section class="context-brief__personality" aria-label="Audience and content">
      ${cells.join("")}
    </section>
  `;
}

// Voice feature — soft mermaid-tinted surface around the existing
// `renderBriefVoiceProfile`. The visual differentiation lives entirely
// in CSS (`.context-brief__voice-profile` is repainted with mermaid-10
// background + mermaid-20 border in the new layout). Returns "" when
// there's nothing to show (empty voice data in read mode).
function renderBriefVoiceFeature(d, isRead) {
  return renderBriefVoiceProfile(d, isRead);
}

// Essentials bar — compact horizontal row combining language picker
// and CTA links. In read mode the CTA list collapses behind a counter
// chip (`<details>`); in edit mode the full CTA editor renders inline
// below the row so the user never has to "open" a control to edit.
function renderBriefEssentialsBar(d, isRead) {
  const language = d?.language || "";
  const ctas = Array.isArray(d?.ctaLinks) ? d.ctaLinks : [];

  if (isRead) {
    const activeCtas = ctas.filter((l) => l.checked);
    if (!language && activeCtas.length === 0) return "";
    const langPill = language
      ? `
        <span class="context-brief__essentials-item">
          <span class="context-brief__essentials-label">Language</span>
          <span class="ap-tag blue context-brief__chip-readonly">${escapeText(language)}</span>
        </span>
      `
      : "";
    const ctaBlock =
      activeCtas.length > 0
        ? `
          <details class="context-brief__essentials-ctas">
            <summary>
              <span class="context-brief__essentials-label">CTA links</span>
              <span class="ap-tag grey context-brief__essentials-cta-count">
                ${activeCtas.length} ${activeCtas.length > 1 ? "links" : "link"}
                <i class="ap-icon-chevron-down"></i>
              </span>
            </summary>
            <ul class="context-brief__cta-readonly-list">
              ${activeCtas
                .map(
                  (cta) => `
                    <li class="context-brief__cta-readonly">
                      <span class="context-brief__cta-label">${escapeText(cta.label)}</span>
                      <span class="context-brief__cta-url">${escapeText(cta.url)}</span>
                    </li>
                  `,
                )
                .join("")}
            </ul>
          </details>
        `
        : "";
    return `
      <section class="context-brief__essentials" aria-label="Essentials">
        <div class="context-brief__essentials-row">
          ${langPill}
          ${ctaBlock}
        </div>
      </section>
    `;
  }

  // Edit mode — language picker as a single-pick chip row + full CTA
  // editor visible below (never collapsed). Reuses the existing
  // renderBriefSinglePick + renderBriefCtaList outputs; CSS resets the
  // inner card chrome inside `.context-brief__essentials`.
  const langPicker = renderBriefSinglePick({
    field: "language",
    title: "Select a language for ideas and posts",
    hint: "Archie will write in this language.",
    options: LANGUAGE_OPTIONS,
    value: language || "English",
    suggested: d?.suggestions?.language || "",
    isRead: false,
  });
  const ctaEditor = renderBriefCtaList(d, false);
  return `
    <section class="context-brief__essentials" aria-label="Essentials">
      ${langPicker}
      ${ctaEditor}
    </section>
  `;
}

// Branding showcase — horizontal strip combining the color tag
// (read mode only) and the image-voice / mood-board block. Both inner
// sections keep their existing markup; CSS scoped to
// `.context-brief__showcase .context-brief__section` strips the card
// chrome so they sit flush inside the showcase.
function renderBriefBrandingShowcase(d, isRead) {
  const color = isRead ? renderBriefColor(d, true) : "";
  const moodBoard = renderBriefImageVoice(d);
  if (!color && !moodBoard) return "";
  return `
    <section class="context-brief__showcase" aria-label="Branding">
      ${color}
      ${moodBoard}
    </section>
  `;
}

function renderContextBriefView() {
  if (!contextBriefConfig) return "";
  const isRead = contextBriefConfig.mode === "read";
  // Read mode reads from a persisted Context; edit mode from the draft.
  const d = isRead ? readBriefFromCtx(contextBriefConfig.getCtx?.()) : contextBriefConfig.getDraft?.() || {};
  const chipProps = (cfg) => ({ ...cfg, isRead });
  // Edit-mode-only: keep the intro infobox above the zones — it teaches
  // the chip color semantics (menthol = suggested, blue = selected) that
  // the rest of the panel relies on. Hero owns name + color in both modes.
  const nonGroupedTop = [isRead ? "" : renderBriefIntro()].filter(Boolean);

  // Per-zone "Refine with Archie" button — read mode only (edit mode is
  // already an editable form). Each zone declares its target sub-flow in
  // the playbook-editor (brief / voice / branding / cta) so clicking
  // Refine jumps the user straight there. See `playbookEditor.refineField`
  // + `withRefine`.
  const canRefine = isRead && !!contextBriefConfig?.onRefineField;
  const sections = [...nonGroupedTop, _renderBriefSectionsInner(d, isRead, canRefine, chipProps)].filter(Boolean);
  // Callers can opt out of the read-mode footer (Close + Edit) via
  // `hideFooter: true` on the config — used by the playbook editor,
  // which has its own Cancel + Save controls and shouldn't show
  // redundant panel-level navigation.
  const footer = contextBriefConfig.hideFooter
    ? ""
    : isRead
      ? `
        <footer class="context-brief__footer">
          <span class="context-brief__footer-spacer"></span>
          <button type="button" class="ap-button stroked grey" data-rpanel-close>
            <span>Close</span>
          </button>
          <button type="button" class="ap-button primary orange" data-brief-edit-mode>
            <i class="ap-icon-pen"></i>
            <span>Edit Playbook</span>
          </button>
        </footer>
      `
      : `
        <footer class="context-brief__footer">
          <button type="button" class="ap-button stroked grey" data-brief-cancel aria-label="Cancel">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="ap-button primary orange"
            data-brief-save
            ${(d.name || "").trim() ? "" : "disabled"}
          >
            <span>Save playbook</span>
          </button>
        </footer>
      `;
  return `
    <div class="context-brief ${isRead ? "context-brief--read" : ""}">
      <div class="context-brief__body">${sections.join("")}</div>
      ${footer}
    </div>
  `;
}

// Map a persisted Context into the shape the brief renderer expects.
// Legacy seeds may have briefSummary instead of businessSummary, or
// audience as a string instead of an array — normalize both.
function readBriefFromCtx(ctx) {
  if (!ctx) return {};
  return {
    name: ctx.name || "",
    websiteUrl: ctx.websiteUrl || "",
    businessSummary: ctx.businessSummary || ctx.briefSummary || "",
    audience: Array.isArray(ctx.audience) ? ctx.audience : ctx.audience ? [ctx.audience] : [],
    audienceProblems: Array.isArray(ctx.audienceProblems) ? ctx.audienceProblems : [],
    tones: Array.isArray(ctx.tones) ? ctx.tones : [],
    contentStyle: Array.isArray(ctx.contentStyle) ? ctx.contentStyle : [],
    objective: Array.isArray(ctx.objective) ? ctx.objective : [],
    contentAction: Array.isArray(ctx.contentAction) ? ctx.contentAction : [],
    ctaLinks: Array.isArray(ctx.ctaLinks)
      ? ctx.ctaLinks
      : ctx.cta
        ? [{ label: ctx.cta, url: ctx.cta, checked: true }]
        : [],
    language: ctx.language || "English",
    color: ctx.color || "orange",
    voiceProfile: ctx.voiceProfile && typeof ctx.voiceProfile === "object" ? ctx.voiceProfile : null,
    imageVoice: ctx.imageVoice && Array.isArray(ctx.imageVoice.websites) ? ctx.imageVoice : { websites: [] },
    suggestions: {},
    customAdditions: {},
  };
}

function renderBriefIntro() {
  return `
    <section class="context-brief__intro">
      <p class="context-brief__intro-text">Help Archie understand your brand so it generates posts that truly fit your voice and audience.</p>
      <div class="ap-infobox info has-title">
        <i class="ap-icon-info_fill"></i>
        <div class="ap-infobox-content">
          <div class="ap-infobox-texts">
            <div class="ap-infobox-title">Pre-filled from your website</div>
            <div class="ap-infobox-message">Green chips are Archie's suggestions. Click any to toggle off, or add your own via "Other…".</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderBriefChips({
  field,
  title,
  hint,
  fromWeb,
  suggestions,
  fallback,
  values,
  customs,
  otherPlaceholder,
  warningCount,
  isRead,
}) {
  // Read mode: only show the SELECTED values (chip pills, non-interactive).
  // Hide the entire section if nothing is selected — keeps the read view
  // honest about what's actually in this context.
  if (isRead) {
    if (!values || values.length === 0) return "";
    const chips = values
      .map((v) => `<span class="ap-tag blue context-brief__chip-readonly">${escapeText(v)}</span>`)
      .join("");
    return `
      <section class="context-brief__section">
        <h3 class="context-brief__title">${escapeText(title)}</h3>
        <div class="context-brief__chips">${chips}</div>
      </section>
    `;
  }
  const valuesSet = new Set(values || []);
  // Render order: suggestions first (menthol/green), then fallback (grey/blue), then customs (always blue).
  const seen = new Set();
  const chipNodes = [];
  for (const v of suggestions || []) {
    if (seen.has(v)) continue;
    seen.add(v);
    chipNodes.push(renderBriefChip(field, v, valuesSet.has(v), true));
  }
  for (const v of fallback || []) {
    if (seen.has(v)) continue;
    seen.add(v);
    chipNodes.push(renderBriefChip(field, v, valuesSet.has(v), false));
  }
  for (const v of customs || []) {
    if (seen.has(v)) continue;
    seen.add(v);
    chipNodes.push(renderBriefChip(field, v, valuesSet.has(v), false));
  }
  // Any value present in the draft but not in any list (defensive — e.g.
  // legacy data) — render as custom.
  for (const v of values || []) {
    if (seen.has(v)) continue;
    seen.add(v);
    chipNodes.push(renderBriefChip(field, v, true, false));
  }
  chipNodes.push(
    `<button type="button" class="ap-tag grey" data-brief-other-toggle="${escapeAttr(field)}"><i class="ap-icon-plus"></i><span>Other…</span></button>`,
  );
  const warning =
    warningCount > 0
      ? `
        <div class="ap-infobox warning has-title">
          <i class="ap-icon-warning_fill"></i>
          <div class="ap-infobox-content">
            <div class="ap-infobox-texts">
              <div class="ap-infobox-title">${warningCount} suggestions — all audiences combined</div>
              <div class="ap-infobox-message">Pick the pains that truly resonate. You'll get a sharper brief by narrowing down to 5–10.</div>
            </div>
          </div>
        </div>
      `
      : "";
  return `
    <section class="context-brief__section" data-brief-field-section="${escapeAttr(field)}">
      <h3 class="context-brief__title">${escapeText(title)}</h3>
      ${hint ? `<p class="context-brief__hint">${escapeText(hint)}</p>` : ""}
      ${warning}
      <div class="context-brief__chips" data-brief-field="${escapeAttr(field)}">${chipNodes.join("")}</div>
      <div class="context-brief__other" data-brief-other-wrap="${escapeAttr(field)}" hidden>
        <div class="ap-input-group">
          <input
            type="text"
            data-brief-other-input="${escapeAttr(field)}"
            placeholder="${escapeAttr(otherPlaceholder || "Add another…")}"
          />
          <button type="button" class="ap-button stroked grey" data-brief-other-submit="${escapeAttr(field)}">
            <span>Add</span>
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderBriefChip(field, value, selected, suggested) {
  // Color logic from the brief HTML:
  //   suggested + unselected  → menthol
  //   suggested + selected    → green
  //   neutral   + unselected  → grey
  //   neutral   + selected    → blue
  let cls;
  if (suggested) cls = selected ? "green" : "menthol";
  else cls = selected ? "blue" : "grey";
  return `
    <button
      type="button"
      class="ap-tag ${cls}"
      data-brief-chip-field="${escapeAttr(field)}"
      data-brief-chip-value="${escapeAttr(value)}"
      aria-pressed="${selected ? "true" : "false"}"
    >${escapeText(value)}</button>
  `;
}

function renderBriefCtaList(d, isRead) {
  const ctas = d.ctaLinks || [];
  if (isRead) {
    const active = ctas.filter((l) => l.checked);
    if (active.length === 0) return "";
    const items = active
      .map(
        (cta) => `
          <li class="context-brief__cta-readonly">
            <span class="context-brief__cta-label">${escapeText(cta.label)}</span>
            <span class="context-brief__cta-url">${escapeText(cta.url)}</span>
          </li>
        `,
      )
      .join("");
    return `
      <section class="context-brief__section">
        <h3 class="context-brief__title">CTA links</h3>
        <ul class="context-brief__cta-readonly-list">${items}</ul>
      </section>
    `;
  }

  // Edit mode — compact checkbox list on top + (when expanded) a Manage
  // sub-panel with editable label / url inputs, delete affordance, and
  // an "Add a CTA link" row. Manage state lives module-local
  // (`ctaManageOpen` + `ctaManageSnapshot`) so it survives the panel's
  // re-renders. Cancel restores the snapshot; Done just closes.
  const compactRows = ctas
    .map(
      (cta, i) => `
        <li class="context-brief__cta-row">
          <label class="ap-checkbox-container">
            <input
              type="checkbox"
              data-brief-cta-toggle-idx="${i}"
              ${cta.checked ? "checked" : ""}
            />
            <i></i>
          </label>
          <span class="context-brief__cta-label">${escapeText(cta.label)}</span>
          <span class="context-brief__cta-url">${escapeText(cta.url)}</span>
        </li>
      `,
    )
    .join("");

  const compactList = compactRows
    ? `<ul class="context-brief__cta-rows">${compactRows}</ul>`
    : `<p class="context-brief__hint">No CTA links yet — click Manage to add one.</p>`;

  const manageRows = ctas
    .map(
      (cta, i) => `
        <li class="context-brief__cta-manage-row">
          <label class="ap-checkbox-container">
            <input
              type="checkbox"
              data-brief-cta-toggle-idx="${i}"
              ${cta.checked ? "checked" : ""}
            />
            <i></i>
          </label>
          <div class="ap-input-group context-brief__cta-manage-label">
            <input
              type="text"
              data-brief-cta-label="${i}"
              value="${escapeAttr(cta.label)}"
              placeholder="Label"
              aria-label="CTA label"
            />
          </div>
          <div class="ap-input-group context-brief__cta-manage-url">
            <input
              type="text"
              data-brief-cta-url="${i}"
              value="${escapeAttr(cta.url)}"
              placeholder="https://…"
              aria-label="CTA URL"
            />
          </div>
          <button
            type="button"
            class="ap-icon-button transparent context-brief__cta-delete"
            data-brief-cta-delete="${i}"
            aria-label="Remove CTA"
          >
            <i class="ap-icon-trash"></i>
          </button>
        </li>
      `,
    )
    .join("");

  const managePanel = ctaManageOpen
    ? `
      <div class="context-brief__cta-manage">
        <div class="context-brief__cta-manage-head">
          <h4 class="context-brief__cta-manage-title">Manage CTA links</h4>
          <div class="context-brief__cta-manage-actions">
            <button type="button" class="ap-button ghost grey" data-brief-cta-manage-cancel>
              <span>Cancel</span>
            </button>
            <button type="button" class="ap-button primary orange" data-brief-cta-manage-done>
              <span>Done</span>
            </button>
          </div>
        </div>
        <ul class="context-brief__cta-manage-rows">${manageRows}</ul>
        <button type="button" class="context-brief__cta-add" data-brief-cta-add>
          <i class="ap-icon-plus"></i><span>Add a CTA link</span>
        </button>
      </div>
    `
    : "";

  const manageBtn = ctaManageOpen
    ? ""
    : `
      <button type="button" class="context-brief__cta-manage-btn" data-brief-cta-manage>
        <i class="ap-icon-pen"></i><span>Manage</span>
      </button>
    `;

  return `
    <section class="context-brief__section context-brief__cta-section">
      <div class="context-brief__cta-head">
        <h3 class="context-brief__title context-brief__cta-title">CTA links</h3>
        ${manageBtn}
      </div>
      ${compactList}
      ${managePanel}
    </section>
  `;
}

function renderBriefSinglePick({ field, title, hint, options, value, suggested, isRead }) {
  if (isRead) {
    if (!value) return "";
    return `
      <section class="context-brief__section">
        <h3 class="context-brief__title">${escapeText(title)}</h3>
        <div class="context-brief__chips">
          <span class="ap-tag blue context-brief__chip-readonly">${escapeText(value)}</span>
        </div>
      </section>
    `;
  }
  const chips = options
    .map((opt) => {
      const isSelected = opt === value;
      const isSuggested = opt === suggested;
      let cls;
      if (isSuggested) cls = isSelected ? "green" : "menthol";
      else cls = isSelected ? "blue" : "grey";
      return `
        <button
          type="button"
          class="ap-tag ${cls}"
          data-brief-single-field="${escapeAttr(field)}"
          data-brief-single-value="${escapeAttr(opt)}"
          aria-pressed="${isSelected ? "true" : "false"}"
        >${escapeText(opt)}</button>
      `;
    })
    .join("");
  return `
    <section class="context-brief__section">
      <h3 class="context-brief__title">${escapeText(title)}</h3>
      ${hint ? `<p class="context-brief__hint">${escapeText(hint)}</p>` : ""}
      <div class="context-brief__chips">${chips}</div>
    </section>
  `;
}

function renderBriefColor(d, isRead) {
  const value = d.color || "orange";
  if (isRead) {
    return `
      <section class="context-brief__section">
        <h3 class="context-brief__title">Color tag</h3>
        <div class="context-brief__color-swatches">
          <span
            class="context-brief__color-swatch is-selected context-brief__color-swatch--readonly"
            style="background: var(--ref-color-${value === "blue" ? "electric-blue" : value}-100);"
            aria-label="${value}"
          ></span>
        </div>
      </section>
    `;
  }
  const swatches = COLOR_SWATCHES.map((c) => {
    const isSelected = c === value;
    return `
      <button
        type="button"
        class="context-brief__color-swatch ${isSelected ? "is-selected" : ""}"
        data-brief-color="${c}"
        style="background: var(--ref-color-${c === "blue" ? "electric-blue" : c}-100);"
        aria-label="${c}"
        aria-pressed="${isSelected ? "true" : "false"}"
      ></button>
    `;
  }).join("");
  return `
    <section class="context-brief__section">
      <h3 class="context-brief__title">Pick a color for your context</h3>
      <p class="context-brief__hint">Shown next to the context name in chats and listings.</p>
      <div class="context-brief__color-swatches">${swatches}</div>
    </section>
  `;
}

// Image Voice — Brand visual identity extracted from the analysed website.
// Read-only in both edit and read modes (colors / fonts / images / personality
// come from the mock analysis, the user does not edit them in V1).
// Section is hidden when no website was analysed (legacy seeds without
// `imageVoice` keep the brief panel ending at the color picker).
function renderBriefImageVoice(d) {
  const websites = Array.isArray(d.imageVoice?.websites) ? d.imageVoice.websites : [];
  if (websites.length === 0) return "";
  const site = websites[0];
  const colors = site.colors || {};
  const typography = site.typography || {};
  const images = site.images || {};
  const buttons = site.buttons || {};
  const personality = site.personality || {};

  const colorRow = (label, hex) => {
    if (!hex) return "";
    return `
      <div class="context-brief__iv-color">
        <span class="context-brief__iv-swatch" style="background:${escapeAttr(hex)};"></span>
        <span class="context-brief__iv-color-label">${escapeText(label)}</span>
        <span class="context-brief__iv-color-hex">${escapeText(hex)}</span>
      </div>
    `;
  };

  const typoRow = (label, value) => {
    if (!value) return "";
    return `
      <div class="context-brief__iv-typo-row">
        <span class="context-brief__iv-typo-label">${escapeText(label)}</span>
        <span class="context-brief__iv-typo-value">${escapeText(value)}</span>
      </div>
    `;
  };

  const fontStack = Array.isArray(typography.fontStack) ? typography.fontStack : [];
  const fontChips = fontStack.map((f) => `<span class="context-brief__iv-font-chip">${escapeText(f)}</span>`).join("");

  const imageTile = (asset) => {
    if (!asset) return "";
    return `
      <div class="context-brief__iv-image">
        <div class="context-brief__iv-image-thumb">
          ${
            asset.url
              ? `<img src="${escapeAttr(asset.url)}" alt="${escapeAttr(asset.label || "")}" loading="lazy" />`
              : `<span class="context-brief__iv-image-placeholder">${escapeText(asset.label || "")}</span>`
          }
        </div>
        <span class="context-brief__iv-image-label">${escapeText(asset.label || "")}</span>
      </div>
    `;
  };

  const primaryBtn = buttons.primary || {};
  const secondaryBtn = buttons.secondary || {};
  const primaryBtnStyle = `background:${escapeAttr(primaryBtn.bg || "#212E44")};color:${escapeAttr(primaryBtn.color || "#fff")};`;
  const secondaryBtnStyle = `background:${escapeAttr(secondaryBtn.bg || "#fff")};color:${escapeAttr(secondaryBtn.color || "#212E44")};border:1px solid ${escapeAttr(secondaryBtn.border || secondaryBtn.color || "#212E44")};`;

  const personalityChips = ["tone", "energy", "audience"]
    .map((key) => {
      const v = personality[key];
      if (!v) return "";
      const label = key === "tone" ? "Tone" : key === "energy" ? "Energy" : "Audience";
      return `<span class="ap-tag grey">${escapeText(label)}: ${escapeText(v)}</span>`;
    })
    .join("");

  return `
    <section class="context-brief__section context-brief__image-voice">
      <header class="context-brief__iv-header">
        <div class="context-brief__iv-heading">
          <h3 class="context-brief__title">Visual identity</h3>
          <p class="context-brief__hint">Pulled from your website</p>
        </div>
      </header>

      <div class="context-brief__iv-site">
        <span class="context-brief__iv-site-favicon"><i class="ap-icon-web"></i></span>
        <div class="context-brief__iv-site-meta">
          <span class="context-brief__iv-site-domain">${escapeText(site.domain || "")}</span>
          <span class="context-brief__iv-site-url">${escapeText(site.url || "")}</span>
        </div>
      </div>

      <div class="context-brief__iv-block">
        <h4 class="context-brief__iv-subtitle">Colors</h4>
        <div class="context-brief__iv-colors">
          ${colorRow("Primary", colors.primary)}
          ${colorRow("Accent", colors.accent)}
          ${colorRow("Background", colors.background)}
          ${colorRow("Body text", colors.textPrimary)}
          ${colorRow("Link", colors.link)}
        </div>
      </div>

      <div class="context-brief__iv-block">
        <h4 class="context-brief__iv-subtitle">Typography</h4>
        <div class="context-brief__iv-typo">
          ${typoRow("Primary", typography.primaryFont)}
          ${typoRow("Heading", typography.headingFont)}
          ${typoRow("H1 size", typography.h1Size)}
          ${typoRow("H2 size", typography.h2Size)}
          ${typoRow("Body size", typography.bodySize)}
        </div>
        ${fontChips ? `<div class="context-brief__iv-font-stack">${fontChips}</div>` : ""}
      </div>

      <div class="context-brief__iv-block">
        <h4 class="context-brief__iv-subtitle">Images</h4>
        <div class="context-brief__iv-images">
          ${imageTile(images.logo)}
          ${imageTile(images.favicon)}
          ${imageTile(images.ogImage)}
        </div>
      </div>

      <div class="context-brief__iv-block">
        <h4 class="context-brief__iv-subtitle">Buttons</h4>
        <div class="context-brief__iv-buttons">
          <span class="context-brief__iv-btn-preview" style="${primaryBtnStyle}">${escapeText(primaryBtn.label || "Primary")}</span>
          <span class="context-brief__iv-btn-preview" style="${secondaryBtnStyle}">${escapeText(secondaryBtn.label || "Secondary")}</span>
        </div>
      </div>

      ${
        personalityChips
          ? `
        <div class="context-brief__iv-block">
          <h4 class="context-brief__iv-subtitle">Personality</h4>
          <div class="context-brief__iv-personality">${personalityChips}</div>
        </div>
      `
          : ""
      }
    </section>
  `;
}

// Voice profile — nested-card layout matching the design reference: a
// grey-05 outer container holds a chevron-toggleable header
// (chevron + megaphone + h3), a sparkle-prefixed headline pill, and a
// stack of white sub-cards (one per subsection). Each sub-card carries:
//   - a small DS icon + UPPERCASE label on the left
//   - a per-card affordance on the right — "Edit" in read mode (routes
//     to playbookEditor.refineField via data-brief-refine-field) or
//     "Add" when the field is empty
//   - the body text below, truncated to ~140 chars with a per-card
//     "Show more" toggle (or the full text when expanded). In edit
//     mode each card's body becomes a textarea.
//
// Empty-state behaviour mirrors the reference: edit mode keeps all nine
// cards visible so the user has a scaffold for what to fill in; read
// mode collapses empty cards out so the playbook only shows what's
// actually there.
const VOICE_PROFILE_SECTIONS = [
  { id: "writingStyle", label: "Writing style", icon: "ap-icon-pen" },
  { id: "vocabulary", label: "Vocabulary", icon: "ap-icon-note" },
  { id: "sentenceStructure", label: "Sentence structure", icon: "ap-icon-numbered-list" },
  { id: "formality", label: "Formality", icon: "ap-icon-target" },
  { id: "personality", label: "Personality", icon: "ap-icon-sparkles" },
  { id: "rhetoricalDevices", label: "Rhetorical devices", icon: "ap-icon-megaphone" },
  { id: "emotionalTone", label: "Emotional tone", icon: "ap-icon-heart" },
  { id: "contentPatterns", label: "Content patterns", icon: "ap-icon-view-grid" },
  { id: "uniqueTraits", label: "Unique traits", icon: "ap-icon-tag" },
];

const VOICE_SNIPPET_LIMIT = 140;

function renderBriefVoiceProfile(d, isRead) {
  const vp = d?.voiceProfile || {};
  const hasAnyText = VOICE_PROFILE_SECTIONS.some((s) => typeof vp[s.id] === "string" && vp[s.id].trim().length > 0);
  // Legacy seeds without voiceProfile keep a clean panel in read mode.
  // Edit mode always renders the scaffold so the user can build it.
  if (isRead && !hasAnyText && !vp.headline) return "";

  const tones = Array.isArray(d?.tones) ? d.tones.filter(Boolean) : [];
  const headline = vp.headline || (tones.length ? tones.join(" · ").toLowerCase() : "");

  // Per-card refine routes through the same handler as the hover-Refine
  // pill on other zones — playbookEditor reads the field id and opens
  // the targeted refine flow. Only surface the affordance when a host
  // has wired `onRefineField`.
  const canRefine = isRead && !!contextBriefConfig?.onRefineField;

  const headlinePill = headline
    ? `
        <div class="context-brief__voice-headline">
          <i class="ap-icon-sparkles"></i>
          <span>${escapeText(headline)}</span>
        </div>
      `
    : `
        <div class="context-brief__voice-headline is-empty">
          <i class="ap-icon-sparkles"></i>
          <span>No voice headline yet</span>
        </div>
      `;

  const subSectionHtml = VOICE_PROFILE_SECTIONS.map((s) => {
    const value = typeof vp[s.id] === "string" ? vp[s.id].trim() : "";
    // Read mode hides empty subsections; edit mode keeps the scaffold.
    if (isRead && !value) return "";

    const isExpanded = voiceProfileExpanded.has(s.id);
    const isTruncated = value.length > VOICE_SNIPPET_LIMIT;
    const snippet =
      isTruncated && !isExpanded ? value.slice(0, VOICE_SNIPPET_LIMIT).replace(/\s+\S*$/, "") + "…" : value;

    let body;
    if (isRead) {
      body = value
        ? `<p class="context-brief__vp-body">${escapeText(snippet)}</p>`
        : `<p class="context-brief__vp-body is-empty">No description yet — click Add to write one.</p>`;
    } else {
      body = `
        <div class="ap-textarea-field resizable">
          <textarea
            data-brief-voice-input="${escapeAttr(s.id)}"
            rows="3"
            placeholder="Describe the brand's ${escapeAttr(s.label.toLowerCase())}…"
          >${escapeText(value)}</textarea>
        </div>
      `;
    }

    // Right-side affordance: "Show more / less" when the snippet
    // truncates; "Edit" when the host wires a refine handler; "Add"
    // when the field is empty + refine wired. Edit mode shows no link
    // — the textarea itself is the affordance.
    let actionLink = "";
    if (isRead) {
      if (isTruncated) {
        actionLink = `
          <button type="button" class="context-brief__vp-toggle" data-brief-voice-toggle="${escapeAttr(s.id)}">
            ${isExpanded ? "Show less" : "Show more"}
          </button>
        `;
      } else if (value && canRefine) {
        actionLink = `
          <button type="button" class="context-brief__vp-action" data-brief-refine-field="voice-${escapeAttr(s.id)}">
            <i class="ap-icon-pen"></i><span>Edit</span>
          </button>
        `;
      } else if (!value && canRefine) {
        actionLink = `
          <button type="button" class="context-brief__vp-action" data-brief-refine-field="voice-${escapeAttr(s.id)}">
            <i class="ap-icon-plus"></i><span>Add</span>
          </button>
        `;
      }
    }

    return `
      <article class="context-brief__vp-section" data-voice-section="${escapeAttr(s.id)}">
        <header class="context-brief__vp-section-head">
          <i class="${escapeAttr(s.icon)}"></i>
          <h4 class="context-brief__vp-section-label">${escapeText(s.label)}</h4>
          ${actionLink}
        </header>
        ${body}
      </article>
    `;
  })
    .filter(Boolean)
    .join("");

  return `
    <section class="context-brief__voice-feature" aria-label="Voice profile">
      <header class="context-brief__voice-header">
        <i class="ap-icon-megaphone context-brief__voice-icon"></i>
        <h3 class="context-brief__voice-title">Voice profile</h3>
      </header>
      ${headlinePill}
      <div class="context-brief__vp-sections">${subSectionHtml}</div>
    </section>
  `;
}
