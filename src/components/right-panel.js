import { html, raw } from "../utils.js?v=20";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=31";
import { isFlagOn } from "../feature-flags.js?v=2";
import { ideas as MOCK_IDEAS } from "../mocks.js?v=29";
import { isNewUser } from "../user-mode.js?v=20";
import { getPath } from "../router.js?v=20";
import {
  getPosts,
  addPostDraft,
  removePost,
  insertPost,
  updatePostContent,
  subscribe as subscribePostsStore,
} from "../posts-store.js?v=25";
import { renderPostCard } from "./post-card.js?v=23";
import { renderClipCard } from "./clip-card.js?v=1";
import { open as openVideoClipsModal } from "./video-clips-modal.js?v=2";
import { CONTEXT_QUESTIONS } from "../context-questions.js?v=20";
import { isSidebarCollapsed, setSidebarCollapsed } from "./sidebar.js?v=35";
import {
  getSources as getStreamSources,
  subscribeSources,
  updateSourceClips,
  removeSources,
} from "../sources-stream.js?v=30";
import { open as openAddSourceModal } from "./add-source-modal.js?v=22";

// Lot 15 — empty in first-time mode so the right-panel Ideas surface lines
// up with the rest of the chrome (sidebar Recent list = empty, dashboard
// = first-run welcome). Returning user gets the full seed.
const IDEAS = isNewUser() ? [] : MOCK_IDEAS;
import { open as openScheduleModal } from "./schedule-modal.js?v=20";
import { open as openGenerateImageModal } from "./generate-image-modal.js?v=21";

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

// Persisted user-resized width override. Read at boot ; rewritten as
// the user drags the resize handle on the panel's left edge. Falls
// back to the static --app-right-panel-width / wide variant when
// unset, so the panel keeps working for users who haven't resized.
const PANEL_WIDTH_KEY = "archie-rpanel-width";
const PANEL_MIN_WIDTH = 380;
const PANEL_MAX_RIGHT_GAP = 400; // leave at least this much for sidebar+content
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

// Ideas-mode local UI state — filter chip + search query. Resets each time
// the panel reopens in Ideas mode.
let ideasFilter = "all";
let ideasQuery = "";

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

// Inline-edit state — only one card in edit mode at a time. Snapshot of
// the original body fields powers the "no spurious save" check.
let editingPostId = null;
let editingOriginal = null; // { text:[], hashtags:[], cta:"" } | null

let state = {
  mode: null, // 'drafts' | 'ideas' | 'context-form' | null
  activeBatchRef: null, // { sessionId, messageId } | null
};

// Context-form mode config — set by openContextForm(). Stays decoupled
// from any specific orchestrator: caller passes callbacks the panel
// invokes on user actions, plus getDraft/getCtx accessors so the panel
// always renders the latest state without owning it.
//
// Shape:
//   { mode: 'edit' | 'read',
//     getDraft?: () => { name, answers: { brandName, audience, tones, ... } },
//     getCtx?:   () => Context,            // read mode reads from contexts-store
//     onAnswer?: (field, value) => void,   // edit mode mutation
//     onName?:   (name)        => void,    // edit mode name input
//     onSave?:   ()            => void,    // edit mode save
//     onCancel?: ()            => void,    // edit mode close-without-save
//     onEnterEdit?: ()         => void,    // read mode → switch to edit
//   }
let contextFormConfig = null;
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

// Floor for the chat column width — under this the assistant panel
// (composer + thread) reads cramped regardless of viewport. When the
// content column would land below this floor with the sidebar still
// expanded, we collapse the sidebar to claw back ~204px (260 − 56).
// The trigger is content-aware (depends on the live panel width) rather
// than a hard viewport breakpoint, so a wide Drafts panel collapses
// the sidebar earlier than a narrow Ideas panel.
const CHAT_MIN_WIDTH_PX = 500;

// Compute the chat column width that would result if the sidebar were
// kept expanded. Reads the actual panel size from the DOM (post-layout)
// so it works for both fit-content and fixed-width grid columns. When
// the panel is closed, the panel.offsetWidth is 0 and the check
// effectively short-circuits via the !state.mode guard above.
function computeChatWidth() {
  if (typeof window === "undefined") return Infinity;
  const sidebar = document.getElementById("sidebar");
  const panel = document.getElementById(PANEL_ID);
  const sidebarW = sidebar ? sidebar.offsetWidth : 260;
  const panelW = panel ? panel.offsetWidth : 0;
  // If the sidebar is already collapsed we use its expanded width
  // (260) for the projection — we want to know what would happen if
  // it were re-expanded, not the current state. 56px collapsed +
  // 204px delta = 260 expanded.
  const projectedSidebar = sidebarW < 200 ? 260 : sidebarW;
  return window.innerWidth - projectedSidebar - panelW;
}

// Collapse the sidebar when the projected chat column would dip below
// CHAT_MIN_WIDTH_PX. Called on panel-open transitions and on window
// resize. We deliberately don't auto-restore on close (the user
// re-expands manually) and we don't run on mode swaps inside an
// already-open panel — only on the closed → open transition or on
// genuine viewport changes.
function maybeCollapseSidebar() {
  if (!state.mode) return;
  if (isSidebarCollapsed()) return;
  if (computeChatWidth() < CHAT_MIN_WIDTH_PX) {
    setSidebarCollapsed(true);
  }
}

function maybeCollapseSidebarOnOpen(prevMode) {
  if (prevMode !== null) return; // mode swap, not an open
  // Defer until after the renderPanel() call that follows in the open*
  // helper completes. Until the panel's `hidden` flag flips and the grid
  // column resolves, panel.offsetWidth would still read 0 and our chat-
  // width math would think there's plenty of room.
  requestAnimationFrame(maybeCollapseSidebar);
}

// Open in Drafts mode pinned to a specific assistant message in a session.
// Called by the in-thread Drafts summary card (Lot 4.3).
export function openDrafts(activeBatchRef) {
  const prev = state.mode;
  state = { mode: "drafts", activeBatchRef: activeBatchRef || state.activeBatchRef };
  maybeCollapseSidebarOnOpen(prev);
  rebindThread();
  renderPanel();
  notify();
}

export function openIdeas() {
  const prev = state.mode;
  state = { ...state, mode: "ideas" };
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
}

// Sources mode — shows the list of sources currently attached to the
// active session. Distinct surface from Outputs (Ideas/Clips) since a
// source is an INPUT to the conversation, not an AI-generated output.
export function openSources() {
  const prev = state.mode;
  state = { ...state, mode: "sources" };
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
}

export function closePanel() {
  // Notify the context-form caller so it can release any per-session state
  // (typically the in-progress draft in context-builder). We let the
  // caller decide whether to discard or persist; the panel just signals
  // that the user closed it.
  if (state.mode === "context-form") {
    contextFormConfig?.onCancel?.();
    contextFormConfig = null;
  }
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
}

export function setMode(mode) {
  if (mode !== "drafts" && mode !== "ideas" && mode !== "context-form") return;
  state = { ...state, mode };
  rebindThread();
  renderPanel();
  notify();
}

// Open the panel in context-form mode. Caller owns the draft + callbacks.
// Use refreshContextForm() from the caller after every state change so the
// panel re-renders against the latest values.
export function openContextForm(config = {}) {
  const prev = state.mode;
  contextFormConfig = { mode: "edit", ...config };
  state = { ...state, mode: "context-form" };
  maybeCollapseSidebarOnOpen(prev);
  renderPanel();
  notify();
}

export function refreshContextForm() {
  if (state.mode === "context-form") renderPanel();
}

export function getContextFormMode() {
  return contextFormConfig?.mode || null;
}

// Close the panel without firing the context-form onCancel callback.
// Used by context-builder after a successful Save — the draft was just
// persisted, no need to discard it via the cancel path.
export function closeContextFormSilently() {
  if (state.mode !== "context-form") return;
  contextFormConfig = null;
  state = { ...state, mode: null };
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

// Voice-profile card UI state — survives re-renders triggered by
// refreshContextBriefPanel. Keys are subsection field ids
// ("writingStyle", "vocabulary", …). The whole-card collapse state
// is tracked separately via `voiceProfileCollapsed`.
const voiceProfileExpanded = new Set();
let voiceProfileCollapsed = false;
export function openContextBriefPanel(config = {}) {
  const prev = state.mode;
  contextBriefConfig = { mode: "edit", ...config };
  // Fresh open — collapse all voice-profile subsections and uncollapse
  // the card so the user lands on a clean overview.
  voiceProfileExpanded.clear();
  voiceProfileCollapsed = false;
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
    el.setAttribute("aria-label", "Drafts and ideas panel");
    el.hidden = true;
    // Lot 17.d — mount inside #appShell so the panel becomes a grid cell
    // (row 2, column 3). Falls back to <body> if the shell isn't there yet
    // (shouldn't happen in normal boot order, but defensive).
    const shell = document.getElementById("appShell") || document.body;
    shell.appendChild(el);
  }
  // Apply user-resized width (if any) before the first render so the
  // grid template column sizes correctly on boot.
  applyPersistedPanelWidth();

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
    // Network select changes are caught in the panel's "change" handler
    // (set up below in init()) — selects don't surface meaningful click
    // events on the chosen option across browsers.
    if (event.target.closest("[data-rpanel-drafts-clear]")) {
      draftsFilter = "all";
      draftsNetwork = "all";
      renderPanel();
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
    const sourcesDetachBtn = event.target.closest("[data-rpanel-sources-detach]");
    if (sourcesDetachBtn) {
      const sid = activeSessionId();
      if (!sid) return;
      removeSources([sourcesDetachBtn.dataset.rpanelSourcesDetach], sid);
      return;
    }
    // "N ideas" button on a source row → switch the panel to Outputs
    // (Ideas tab) and pulse the cards that came from this source so the
    // user spots them.
    const sourceIdeasBtn = event.target.closest("[data-rpanel-sources-show-ideas]");
    if (sourceIdeasBtn) {
      const sourceId = sourceIdeasBtn.dataset.rpanelSourcesShowIdeas;
      outputsView = "ideas";
      state = { ...state, mode: "ideas" };
      renderPanel();
      // Wait for the panel re-render, then pulse the source's idea cards.
      requestAnimationFrame(() => {
        const panel = document.querySelector(".app-right-panel");
        if (!panel) return;
        const cards = Array.from(panel.querySelectorAll("[data-idea-id]")).filter((card) => {
          // idea-card stores sourceIds via the sources panel below the
          // title; we don't have a data attribute for them, so we re-
          // derive from the IDEAS seed by id.
          const id = card.getAttribute("data-idea-id");
          const idea = IDEAS.find((i) => i.id === id);
          return idea && Array.isArray(idea.sourceIds) && idea.sourceIds.includes(sourceId);
        });
        cards.forEach((c) => {
          c.classList.remove("is-focused");
          void c.offsetWidth;
          c.classList.add("is-focused");
        });
        if (cards[0]) cards[0].scrollIntoView({ behavior: "smooth", block: "center" });
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
      ideasQuery = "";
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
    // Per-card "Draft Post" — drafts that single clip into the active
    // session. Same payload shape as the footer multi-select CTA.
    const clipDraftBtn = event.target.closest("[data-clip-draft]");
    if (clipDraftBtn) {
      const cid = clipDraftBtn.getAttribute("data-clip-draft");
      const entry = collectAllClips().find(({ clip }) => clip.id === cid);
      const sid = activeSessionId();
      if (!sid || !entry) return;
      const { clip, sourceName } = entry;
      addPostDraft(sid, {
        network: clip.network,
        text: [clip.title, clip.summary].filter(Boolean),
        hashtags: (clip.tags || []).map((t) => `#${t}`),
        clipRef: { start: clip.start, end: clip.end, sourceName, hue: clip.hue },
      });
      import("./toast.js").then(({ showToast }) => showToast(`Drafted a post from clip`, { duration: 3200 }));
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
      import("../screens/session.js?v=82").then(({ postSubtitleQuestion }) => {
        postSubtitleQuestion(
          sid,
          drafts.map((d) => d.id),
        );
      });
      return;
    }
    // Use this idea → injects a templated prompt into the assistant composer.
    const useBtn = event.target.closest("[data-rpanel-use-idea]");
    if (useBtn) {
      useIdea(useBtn.dataset.rpanelUseIdea);
      return;
    }

    // ── Context-form clicks ───────────────────────────────────────────
    const ctxPick = event.target.closest("[data-ctx-pick]");
    if (ctxPick) {
      contextFormConfig?.onAnswer?.(ctxPick.dataset.ctxPick, ctxPick.dataset.ctxValue);
      return;
    }
    const ctxToggle = event.target.closest("[data-ctx-toggle]");
    if (ctxToggle) {
      const field = ctxToggle.dataset.ctxToggle;
      const val = ctxToggle.dataset.ctxValue;
      const draft = contextFormConfig?.getDraft?.();
      const current = Array.isArray(draft?.answers?.[field]) ? draft.answers[field].slice() : [];
      const idx = current.indexOf(val);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(val);
      contextFormConfig?.onAnswer?.(field, current);
      return;
    }
    const ctxRemove = event.target.closest("[data-ctx-remove]");
    if (ctxRemove) {
      const field = ctxRemove.dataset.ctxRemove;
      const val = ctxRemove.dataset.ctxValue;
      const draft = contextFormConfig?.getDraft?.();
      const current = Array.isArray(draft?.answers?.[field]) ? draft.answers[field].slice() : [];
      const next = current.filter((v) => v !== val);
      contextFormConfig?.onAnswer?.(field, next);
      return;
    }
    const ctxOtherAdd = event.target.closest("[data-ctx-other-add]");
    if (ctxOtherAdd) {
      const field = ctxOtherAdd.dataset.ctxOtherAdd;
      const input = el.querySelector(`[data-ctx-other-input="${field}"]`);
      const v = (input?.value || "").trim();
      if (!v) return;
      const draft = contextFormConfig?.getDraft?.();
      const current = Array.isArray(draft?.answers?.[field]) ? draft.answers[field].slice() : [];
      if (!current.includes(v)) current.push(v);
      contextFormConfig?.onAnswer?.(field, current);
      // The re-render replaces the input, so the value naturally clears.
      return;
    }
    if (event.target.closest("[data-ctx-save]")) {
      contextFormConfig?.onSave?.();
      return;
    }
    if (event.target.closest("[data-ctx-cancel]")) {
      // Cancel = same as close from the user's perspective.
      closePanel();
      return;
    }
    if (event.target.closest("[data-ctx-edit-mode]")) {
      contextFormConfig?.onEnterEdit?.();
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
    const briefVoiceToggle = event.target.closest("[data-brief-voice-toggle]");
    if (briefVoiceToggle) {
      const id = briefVoiceToggle.dataset.briefVoiceToggle;
      if (voiceProfileExpanded.has(id)) voiceProfileExpanded.delete(id);
      else voiceProfileExpanded.add(id);
      refreshContextBriefPanel?.();
      return;
    }
    if (event.target.closest("[data-brief-voice-card-toggle]")) {
      voiceProfileCollapsed = !voiceProfileCollapsed;
      refreshContextBriefPanel?.();
      return;
    }
    const briefCta = event.target.closest("[data-brief-cta-toggle]");
    if (briefCta) {
      // The native checkbox toggles its own state; we just propagate.
      contextBriefConfig?.onToggleCta?.(briefCta.dataset.briefCtaToggle);
      return;
    }
    if (event.target.closest("[data-brief-save]")) {
      contextBriefConfig?.onSave?.();
      return;
    }
    if (event.target.closest("[data-brief-cancel]")) {
      contextBriefConfig?.onCancel?.();
      closePanel();
      return;
    }
    if (event.target.closest("[data-brief-edit-mode]")) {
      contextBriefConfig?.onEnterEdit?.();
      return;
    }
  });
  el.addEventListener("change", (event) => {
    if (event.target.matches("[data-rpanel-drafts-network-select]")) {
      draftsNetwork = event.target.value || "all";
      renderPanel();
      return;
    }
  });
  el.addEventListener("input", (event) => {
    if (event.target.matches("[data-rpanel-ideas-search]")) {
      ideasQuery = event.target.value || "";
      renderIdeasBodyOnly();
      return;
    }
    // Context-form free-text inputs — push every keystroke into the
    // draft so chars survive any subsequent re-render. Re-render is NOT
    // triggered from here ; the caller decides when to refreshContextForm
    // (typically only when toggling chips or saving).
    const ctxText = event.target.matches("[data-ctx-text]") ? event.target : null;
    if (ctxText) {
      contextFormConfig?.onAnswer?.(ctxText.dataset.ctxText, ctxText.value);
      return;
    }
    if (event.target.matches("[data-ctx-name]")) {
      contextFormConfig?.onName?.(event.target.value);
      // Save button enable/disable hinges on name presence — re-render
      // the footer only if the disabled state actually flipped, to avoid
      // killing the input focus mid-typing.
      const btn = el.querySelector("[data-ctx-save]");
      if (btn) {
        const shouldDisable = !event.target.value.trim();
        if (shouldDisable && !btn.hasAttribute("disabled")) btn.setAttribute("disabled", "");
        else if (!shouldDisable && btn.hasAttribute("disabled")) btn.removeAttribute("disabled");
      }
      return;
    }
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
  });
  // Enter inside the "Other…" text input on a chip-multi-add question
  // appends the chip — same affordance as clicking the + button.
  el.addEventListener("keydown", (event) => {
    const otherInput = event.target.matches("[data-ctx-other-input]") ? event.target : null;
    if (otherInput && event.key === "Enter") {
      event.preventDefault();
      const field = otherInput.dataset.ctxOtherInput;
      const v = otherInput.value.trim();
      if (!v) return;
      const draft = contextFormConfig?.getDraft?.();
      const current = Array.isArray(draft?.answers?.[field]) ? draft.answers[field].slice() : [];
      if (!current.includes(v)) current.push(v);
      contextFormConfig?.onAnswer?.(field, current);
    }
    // V1 brief panel — same Enter-to-add affordance on Other inputs.
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
    if (event.key === "Escape" && state.mode) {
      closePanel();
    }
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
}

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
    // Drafts + context-brief render rich, multi-section content — both
    // need the wider panel column. The compact Ideas/Sources list stays
    // on the default 460px.
    shell.classList.toggle("is-right-panel-wide", state.mode === "drafts" || state.mode === "context-brief");
  }
  if (!state.mode) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  // The mode toggle lives in the topbar pills only — the panel head shows
  // the active mode as a static title to avoid duplicating the toggle.
  // (Earlier iteration had Drafts/Ideas tabs here too ; the user flagged
  // them as redundant on 2026-04-29.)
  let titleIcon = "ap-icon-sparkles";
  let titleText = "Outputs";
  if (state.mode === "drafts") {
    titleIcon = "ap-icon-pen";
    titleText = "Drafts";
  } else if (state.mode === "sources") {
    titleIcon = "ap-icon-file";
    titleText = "Sources";
  } else if (state.mode === "context-form") {
    titleIcon = "ap-icon-target";
    const isRead = contextFormConfig?.mode === "read";
    if (isRead) {
      const ctx = contextFormConfig.getCtx?.();
      titleText = ctx?.name || "Playbook";
    } else {
      const draft = contextFormConfig?.getDraft?.();
      titleText = draft?.name?.trim() || "Build your playbook";
    }
  } else if (state.mode === "context-brief") {
    titleIcon = "ap-icon-target";
    if (contextBriefConfig?.mode === "read") {
      const ctx = contextBriefConfig.getCtx?.();
      titleText = ctx?.name || "Playbook";
    } else {
      const draft = contextBriefConfig?.getDraft?.();
      titleText = draft?.name?.trim() || "Define your content brief";
    }
  }
  // The context-form / context-brief views manage their own scrolling body
  // + sticky footer (so Save sits flush at the bottom). Drafts/Ideas/Sources
  // keep the historical .app-right-panel__body wrapper.
  const bodyHtml =
    state.mode === "context-form"
      ? renderContextFormView()
      : state.mode === "context-brief"
        ? renderContextBriefView()
        : `<div class="app-right-panel__body">${
            state.mode === "drafts"
              ? renderDraftsView()
              : state.mode === "sources"
                ? renderSourcesView()
                : renderIdeasView()
          }</div>`;

  el.innerHTML = html`
    <div
      class="app-right-panel__resize"
      data-rpanel-resize
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      title="Drag to resize"
    ></div>
    <div class="app-right-panel__head">
      <h2 class="app-right-panel__title">
        <i class="${titleIcon}" aria-hidden="true"></i>
        <span>${titleText}</span>
      </h2>
      <button
        type="button"
        class="ap-icon-button transparent"
        data-rpanel-close
        aria-label="Close panel"
        title="Close panel (Esc)"
      >
        <i class="ap-icon-close"></i>
      </button>
    </div>
    ${raw(bodyHtml)}
  `;
}

// --- Resize handle -----------------------------------------------------

// Apply a previously-persisted user width (if any) as a CSS custom
// property on the shell. The grid-template-columns rules in layout.css
// honor this var when set. Called once at init, before the first
// renderPanel.
function applyPersistedPanelWidth() {
  const shell = document.getElementById("appShell");
  if (!shell) return;
  const stored = localStorage.getItem(PANEL_WIDTH_KEY);
  if (stored) shell.style.setProperty("--app-right-panel-width-runtime", `${stored}px`);
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
  // Persist the resolved width so it survives a reload.
  const shell = document.getElementById("appShell");
  const w = shell?.style.getPropertyValue("--app-right-panel-width-runtime");
  if (w) {
    const parsed = parseInt(w, 10);
    if (Number.isFinite(parsed)) localStorage.setItem(PANEL_WIDTH_KEY, String(parsed));
  }
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

  // Filter rail — vertical, sticky, on the left. Reuses the same
  // `.posts__rail / .posts__filter` chrome the source-prototype Posts
  // tab used (driven by posts.css) so we don't reinvent the styling.
  const filterRow = (id, icon, label, count) => {
    const active = draftsFilter === id;
    return `
      <button
        type="button"
        class="posts__filter ${active ? "is-active" : ""}"
        data-rpanel-drafts-filter="${id}"
      >
        <i class="${icon}"></i>
        <span class="posts__filter-label">${label}</span>
        <span class="posts__filter-count">${count}</span>
      </button>
    `;
  };

  // Network filter is a DS native select, not a row of buttons or a
  // segmented control: its 3 mutually-exclusive options take less room
  // than 3 pills (matters in the compact ≤1440 layout where the rail
  // shares a single horizontal row with the status filters), and the
  // browser-native picker keeps the wide layout from wasting vertical
  // space on a label list.
  const networkOpt = (id, label, count) =>
    `<option value="${id}" ${draftsNetwork === id ? "selected" : ""}>${label} (${count})</option>`;
  const networkSelect = `
    <select
      class="ap-native-select posts__rail-network-select"
      data-rpanel-drafts-network-select
      aria-label="Filter by network"
    >
      ${networkOpt("all", "All networks", networkCounts.all)}
      ${networkOpt("linkedin", "LinkedIn", networkCounts.linkedin)}
      ${networkOpt("twitter", "X", networkCounts.twitter)}
    </select>
  `;

  const rail = `
    <aside class="posts__rail" aria-label="Post filters">
      <div class="posts__rail-group">
        ${filterRow("all", "ap-icon-megaphone", "All posts", filterCounts.all)}
        ${filterRow("needs_fixes", "ap-icon-error", "Needs fixes", filterCounts.needs_fixes)}
        ${filterRow("scheduled", "ap-icon-calendar", "Scheduled", filterCounts.scheduled)}
      </div>
      <div class="posts__rail-group posts__rail-group--network">
        <h3 class="posts__rail-heading">Network</h3>
        ${networkSelect}
      </div>
    </aside>
  `;

  // FIND-B5: align the no-match state with the rich `No drafts yet`
  // pattern just below — icon + title + sub + Clear filters CTA. The
  // CTA resets both filter axes through data-rpanel-drafts-clear so the
  // rail buttons and state mutation stay in lockstep.
  const feed = filtered.length
    ? filtered.map((p) => renderPostCard(p, { editing: p.id === editingPostId, inlineEdit })).join("")
    : `<div class="app-right-panel__empty">
         <div class="app-right-panel__empty-icon"><i class="ap-icon-search"></i></div>
         <div class="app-right-panel__empty-title">No drafts match this filter</div>
         <div class="app-right-panel__empty-sub">Try another filter, or clear the current one.</div>
         <div class="app-right-panel__empty-action">
           <button type="button" class="ap-button stroked grey" data-rpanel-drafts-clear>Clear filters</button>
         </div>
       </div>`;

  return html`
    <div class="rpanel-drafts">
      ${raw(rail)}
      <div class="posts__feed rpanel-drafts__feed">${raw(feed)}</div>
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
  // The real rewrite-with-AI loop will reuse the assistant pipeline ;
  // stub for now with a toast so the wiring is visible.
  import("./toast.js?v=20").then(({ showToast }) => {
    showToast("Regenerating draft… (mock)", { actionLabel: null });
  });
}

function onPostSchedule(postId) {
  const sid = activeSessionId();
  if (!sid) return;
  const post = getPosts(sid).find((p) => p.id === postId);
  if (!post) return;
  openScheduleModal({
    posts: [post],
    onConfirm: () => {
      // Mark the post scheduled in-place — the store doesn't have a
      // dedicated mutator yet, so we mutate the object directly. Future
      // refactor: posts-store.markScheduled(sid, postId, label).
      post.status = "scheduled";
      post.scheduledForLabel = post.scheduledForLabel || "later";
      renderPanel();
      import("./toast.js?v=20").then(({ showToast }) => showToast("Draft scheduled"));
    },
  });
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
          <div class="app-right-panel__empty-title">Open a conversation</div>
          <div class="app-right-panel__empty-sub">Sources attach to a conversation. Start or open one to manage its inputs.</div>
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
        <div class="rpanel-sources__sub muted">These files feed this conversation's outputs.</div>
      </div>
      <button type="button" class="ap-button stroked grey" data-rpanel-sources-attach>
        <i class="ap-icon-plus"></i>
        <span>Attach</span>
      </button>
    </div>
  `;
  if (sources.length === 0) {
    return `
      <div class="rpanel-sources">
        ${head}
        <div class="app-right-panel__empty rpanel-sources__empty">
          <div class="app-right-panel__empty-icon"><i class="ap-icon-file"></i></div>
          <div class="app-right-panel__empty-title">No sources yet</div>
          <div class="app-right-panel__empty-sub">Attach a file or pick from your library to start.</div>
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
      <div class="rpanel-sources__list">${rows}</div>
    </div>
  `;
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

function renderSourceRow(src) {
  const icon = SOURCE_KIND_ICON[src.kind] || "ap-icon-file";
  const hasIdeas = src.ideaCount > 0;
  const ideaLabel = hasIdeas ? `${src.ideaCount} idea${src.ideaCount === 1 ? "" : "s"}` : "";
  const isProcessing = src.status !== "Processed";
  // Only surface a status pill while the source is in-flight. Once
  // Processed, the row stays uncluttered — the filename + meta carry it.
  const statusEl = isProcessing ? `<span class="ap-status grey rpanel-sources__row-status">Processing</span>` : "";
  // Meta line: "addedAt · <clickable N ideas>". The ideas count is a
  // button that switches the panel to Outputs (Ideas tab) so the user
  // can review what the source produced. addedAt stays as static text.
  const ideasButton = hasIdeas
    ? `<button type="button" class="rpanel-sources__row-ideas-btn" data-rpanel-sources-show-ideas="${src.id}">${ideaLabel}</button>`
    : "";
  const metaParts = [];
  if (src.addedAt) metaParts.push(`<span>${escapeText(src.addedAt)}</span>`);
  if (ideasButton) metaParts.push(ideasButton);
  const meta = metaParts.length ? metaParts.join(' <span aria-hidden="true">·</span> ') : "";
  return `
    <div class="rpanel-sources__row" data-source-id="${src.id}">
      <span class="rpanel-sources__row-icon" aria-hidden="true"><i class="${icon}"></i></span>
      <div class="rpanel-sources__row-body">
        <div class="rpanel-sources__row-name">${escapeText(src.filename)}</div>
        ${meta ? `<div class="rpanel-sources__row-meta muted">${meta}</div>` : ""}
      </div>
      ${statusEl}
      <button
        type="button"
        class="ap-icon-button transparent rpanel-sources__row-detach"
        data-rpanel-sources-detach="${src.id}"
        aria-label="Detach ${escapeAttr(src.filename)}"
        title="Detach"
      >
        <i class="ap-icon-close"></i>
      </button>
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

  return html`
    <div class="rpanel-ideas">
      ${raw(tabs)}
      <div class="rpanel-ideas__head">
        <div class="ap-input-group rpanel-ideas__search">
          <i class="ap-icon-search"></i>
          <input
            type="search"
            class="ap-input"
            placeholder="Search ideas…"
            value="${escapeAttr(ideasQuery)}"
            data-rpanel-ideas-search
          />
        </div>
        <div class="rpanel-ideas__filters" role="tablist">
          ${raw(
            IDEA_KINDS.map(
              (k) => `
                <button
                  type="button"
                  class="rpanel-ideas__filter ${ideasFilter === k.id ? "is-on" : ""}"
                  data-rpanel-ideas-filter="${k.id}"
                  role="tab"
                  aria-selected="${ideasFilter === k.id}"
                >${k.label}</button>
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
      out.push({ clip, sourceName: src.filename || "Source", sourceId: src.id });
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

  const cards = entries
    .map(({ clip, sourceName }) =>
      renderClipCard(clip, {
        selectable: true,
        isSelected: clipSelection.has(clip.id),
        sourceName,
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
  const q = ideasQuery.trim().toLowerCase();
  const list = IDEAS.filter((i) => ideasFilter === "all" || i.kind === ideasFilter).filter(
    (i) => !q || (i.body || "").toLowerCase().includes(q) || (i.title || "").toLowerCase().includes(q),
  );
  if (list.length === 0) {
    // FIND-B6: align with the rich empty pattern. When the user has a
    // search query, propose to clear it; otherwise the filter chip is
    // the only narrowing axis so we point them at the All chip.
    const hasQuery = (ideasQuery || "").trim().length > 0;
    return html`
      <div class="app-right-panel__empty rpanel-ideas__no-match">
        <div class="app-right-panel__empty-icon"><i class="ap-icon-search"></i></div>
        <div class="app-right-panel__empty-title">No ideas match</div>
        <div class="app-right-panel__empty-sub">
          ${hasQuery
            ? `No idea matches "${escapeText(ideasQuery)}". Try a different term or clear the search.`
            : "Switch to a different kind, or pick All to broaden the list."}
        </div>
        <div class="app-right-panel__empty-action">
          <button type="button" class="ap-button stroked grey" data-rpanel-ideas-clear>Clear filters</button>
        </div>
      </div>
    `;
  }
  return list.map((i) => renderIdeaCompact(i)).join("");
}

function renderIdeasBodyOnly() {
  const body = document.querySelector("[data-rpanel-ideas-body]");
  if (body) body.innerHTML = renderIdeasList();
}

function renderIdeaCompact(idea) {
  const kind = idea.kind || "insight";
  const usedLabel = idea.used > 0 ? `Used ${idea.used}×` : "Unused";
  const tags = (idea.tags || [])
    .slice(0, 3)
    .map((t) => `<span class="rpanel-ideas__tag">#${escapeText(t)}</span>`)
    .join("");
  return `
    <article class="rpanel-ideas__card">
      <header class="rpanel-ideas__card-head">
        <span class="ap-tag rpanel-ideas__kind rpanel-ideas__kind--${kind}">${kind}</span>
        <span class="rpanel-ideas__used">${usedLabel}</span>
      </header>
      ${idea.title ? `<div class="rpanel-ideas__card-title">${escapeText(idea.title)}</div>` : ""}
      <p class="rpanel-ideas__card-body">${escapeText(idea.body || "")}</p>
      ${tags ? `<div class="rpanel-ideas__tag-row">${tags}</div>` : ""}
      <footer class="rpanel-ideas__card-foot">
        <span class="rpanel-ideas__ref">${escapeText(idea.ref || "Generated")}</span>
        <button type="button" class="ap-button stroked orange rpanel-ideas__use" data-rpanel-use-idea="${idea.id}">
          <i class="ap-icon-arrow-up"></i>
          <span>Use</span>
        </button>
      </footer>
    </article>
  `;
}

// Inject a templated prompt into the assistant composer of whichever session
// is currently mounted. Closes the panel so the user lands back on the chat
// surface ready to send / tweak.
function useIdea(ideaId) {
  const idea = IDEAS.find((i) => i.id === ideaId);
  if (!idea) return;
  const input = document.getElementById("assistantInput");
  if (!input) return;
  const text = `Build a batch of posts around this ${idea.kind || "idea"}:\n\n"${idea.body}"`;
  input.value = text;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  closePanel();
}

function escapeText(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return escapeText(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// --- Context-form mode ------------------------------------------------
//
// Iterates CONTEXT_QUESTIONS to render a stack of question groups, each
// driven by its `type`:
//   - text / textarea       — free input wired to onAnswer(field, value)
//   - chips-radio           — button row, single selection
//   - chips-multi           — button row, toggle selection (clamped by max)
//   - chips-multi-add       — chips-multi + a free-form "Other…" input that
//                             appends a new chip to the selected list
// In read mode the inputs are inert and unselected chips are hidden so the
// stored values read at a glance.

function renderContextFormView() {
  if (!contextFormConfig) return "";
  const isRead = contextFormConfig.mode === "read";
  const data = isRead
    ? readSourceFromCtx(contextFormConfig.getCtx?.())
    : contextFormConfig.getDraft?.() || { name: "", answers: {} };
  const answers = data.answers || {};
  const groups = CONTEXT_QUESTIONS.map((q) => renderContextFormGroup(q, answers[q.field], isRead)).join("");
  const intro = isRead
    ? ""
    : `<p class="context-form__intro">Pick the answers that fit. Add an Other… chip on any list when nothing matches.</p>`;
  const footer = isRead ? renderContextFormFooterRead() : renderContextFormFooterEdit(data.name || "");
  return `
    <div class="context-form ${isRead ? "context-form--read" : ""}">
      ${intro}
      <div class="context-form__body">${groups}</div>
      ${footer}
    </div>
  `;
}

// Surface the saved Context as { name, answers } so renderContextFormGroup
// can read both the same way it reads the live draft.
function readSourceFromCtx(ctx) {
  if (!ctx) return { name: "", answers: {} };
  return {
    name: ctx.name || "",
    answers: {
      brandName: ctx.brandName || "",
      audience: ctx.audience || "",
      tones: ctx.tones || [],
      doRules: ctx.doRules || [],
      dontRules: ctx.dontRules || [],
      briefSummary: ctx.briefSummary || "",
      cta: ctx.cta || "",
      color: ctx.color || "orange",
    },
  };
}

function renderContextFormGroup(q, value, isRead) {
  const label = `<h3 class="context-form__label">${escapeText(q.label)}</h3>`;
  const hint = q.hint ? `<p class="context-form__hint">${escapeText(q.hint)}</p>` : "";
  let body = "";
  if (q.type === "text") body = renderTextInput(q, value, isRead);
  else if (q.type === "textarea") body = renderTextarea(q, value, isRead);
  else if (q.type === "chips-radio") body = renderChipsRadio(q, value, isRead);
  else if (q.type === "chips-multi") body = renderChipsMulti(q, value, isRead, false);
  else if (q.type === "chips-multi-add") body = renderChipsMulti(q, value, isRead, true);
  const accent = q.accent === "red" ? " context-form__group--accent-red" : "";
  return `<section class="context-form__group${accent}" data-ctx-group="${q.id}">${label}${hint}${body}</section>`;
}

function renderTextInput(q, value, isRead) {
  if (isRead) {
    if (!value) return `<p class="context-form__readonly-empty">Not set.</p>`;
    return `<p class="context-form__readonly-text">${escapeText(value)}</p>`;
  }
  return `
    <div class="ap-input-group context-form__input">
      <input
        type="text"
        class="ap-input"
        data-ctx-text="${q.field}"
        value="${escapeAttr(value || "")}"
        placeholder="${escapeAttr(q.placeholder || "")}"
      />
    </div>
  `;
}

function renderTextarea(q, value, isRead) {
  if (isRead) {
    if (!value) return `<p class="context-form__readonly-empty">Not set.</p>`;
    return `<p class="context-form__readonly-text">${escapeText(value)}</p>`;
  }
  return `
    <textarea
      class="context-form__textarea"
      data-ctx-text="${q.field}"
      placeholder="${escapeAttr(q.placeholder || "")}"
      rows="3"
    >${escapeText(value || "")}</textarea>
  `;
}

function renderChipsRadio(q, value, isRead) {
  const selected = value || "";
  const isColor = q.id === "color";
  const chips = q.options
    .map((opt) => {
      const on = opt === selected ? " is-on" : "";
      if (isColor) {
        const swatchStyle = `background: var(--ref-color-${opt}-100);`;
        return `
          <button
            type="button"
            class="ap-tag context-form__chip context-form__chip--swatch${on}"
            data-ctx-pick="${q.field}"
            data-ctx-value="${escapeAttr(opt)}"
            aria-pressed="${on ? "true" : "false"}"
            aria-label="${escapeAttr(opt)}"
            title="${escapeAttr(opt)}"
            style="${swatchStyle}"
          ></button>
        `;
      }
      return `
        <button
          type="button"
          class="ap-tag context-form__chip${on}"
          data-ctx-pick="${q.field}"
          data-ctx-value="${escapeAttr(opt)}"
          aria-pressed="${on ? "true" : "false"}"
        >${escapeText(opt)}</button>
      `;
    })
    .join("");
  return `<div class="context-form__chip-row">${chips}</div>`;
}

function renderChipsMulti(q, value, isRead, withAdd) {
  const selected = Array.isArray(value) ? value : [];
  const presetSet = new Set(q.options || []);
  // Show the preset options first, then any user-typed entries that aren't
  // in the preset list (only matters for chips-multi-add — those need the
  // remove × so the user can drop one).
  const customs = selected.filter((v) => !presetSet.has(v));
  const preset = (q.options || [])
    .map((opt) => {
      const on = selected.includes(opt) ? " is-on" : "";
      const removable = "";
      return `
        <button
          type="button"
          class="ap-tag context-form__chip${on}"
          data-ctx-toggle="${q.field}"
          data-ctx-value="${escapeAttr(opt)}"
          aria-pressed="${on ? "true" : "false"}"
        >${escapeText(opt)}${removable}</button>
      `;
    })
    .join("");
  const customChips = customs
    .map((opt) => {
      const removable = isRead
        ? ""
        : `<button type="button" class="context-form__chip-remove" data-ctx-remove="${q.field}" data-ctx-value="${escapeAttr(opt)}" aria-label="Remove"><i class="ap-icon-close"></i></button>`;
      return `
        <span class="ap-tag context-form__chip is-on" aria-pressed="true">${escapeText(opt)}${removable}</span>
      `;
    })
    .join("");
  const otherRow = isRead
    ? ""
    : `
      <span class="ap-tag context-form__chip context-form__other">
        <input
          type="text"
          class="context-form__other-input"
          data-ctx-other-input="${q.field}"
          placeholder="${escapeAttr(withAdd ? q.addPlaceholder || "Add…" : "Other…")}"
        />
        <button
          type="button"
          class="context-form__other-add"
          data-ctx-other-add="${q.field}"
          aria-label="Add"
          title="Add"
        ><i class="ap-icon-plus"></i></button>
      </span>
    `;
  return `<div class="context-form__chip-row">${preset}${customChips}${otherRow}</div>`;
}

function renderContextFormFooterEdit(name) {
  const canSave = !!name.trim();
  return `
    <footer class="context-form__footer">
      <div class="ap-input-group">
        <input
          type="text"
          class="ap-input"
          placeholder="Name this playbook (e.g. Acme · Q3)"
          data-ctx-name
          value="${escapeAttr(name)}"
        />
      </div>
      <button type="button" class="ap-button stroked grey" data-ctx-cancel>
        <span>Cancel</span>
      </button>
      <button
        type="button"
        class="ap-button primary orange"
        data-ctx-save
        ${canSave ? "" : "disabled"}
      >
        <i class="ap-icon-rounded-check"></i>
        <span>Save playbook</span>
      </button>
    </footer>
  `;
}

function renderContextFormFooterRead() {
  return `
    <footer class="context-form__footer">
      <span class="context-form__footer-spacer"></span>
      <button type="button" class="ap-button stroked grey" data-rpanel-close>
        <span>Close</span>
      </button>
      <button type="button" class="ap-button primary orange" data-ctx-edit-mode>
        <i class="ap-icon-pen"></i>
        <span>Edit</span>
      </button>
    </footer>
  `;
}

// --- V1 Brief panel ---------------------------------------------------

const COLOR_SWATCHES = ["orange", "blue", "green", "purple", "red", "yellow"];
const LANGUAGE_OPTIONS = ["English", "Français", "Español", "Deutsch", "Italiano", "Português"];
const TONE_FALLBACKS = [
  "Conversational & approachable",
  "Bold & opinionated",
  "Neutral & informative",
  "Playful & witty",
];
const STYLE_FALLBACKS = ["Educational with case studies", "Inspirational & aspirational", "Behind-the-scenes & human"];
const OBJECTIVE_FALLBACKS = ["Drive traffic", "Community engagement", "Thought leadership", "Customer retention"];
const ACTION_FALLBACKS = ["Visit the website", "Download a resource", "Join the community", "Contact sales"];

function renderContextBriefView() {
  if (!contextBriefConfig) return "";
  const isRead = contextBriefConfig.mode === "read";
  // Read mode reads from a persisted Context; edit mode from the draft.
  const d = isRead ? readBriefFromCtx(contextBriefConfig.getCtx?.()) : contextBriefConfig.getDraft?.() || {};
  const chipProps = (cfg) => ({ ...cfg, isRead });
  // Identité du panel — hors groupes. En read mode le nom du contexte est
  // dans le header du right panel, donc on saute renderBriefName.
  const nonGroupedTop = [isRead ? "" : renderBriefIntro(), isRead ? "" : renderBriefName(d)].filter(Boolean);

  // Chaque groupe a son propre conteneur. C'est essentiel pour le sticky
  // push-out style iOS Settings : un sticky header siblings au même `top:
  // 0` se stack, alors qu'un sticky header borné par son groupe parent
  // est "poussé" hors écran quand le groupe suivant arrive.
  const audienceCards = [
    isRead ? renderBriefSummaryRead(d) : renderBriefBusinessSummary(d),
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
    renderBriefCtaList(d, isRead),
    renderBriefSinglePick({
      field: "language",
      title: isRead ? "Language" : "Select a language for ideas and posts",
      hint: isRead ? "" : "Archie will write in this language.",
      options: LANGUAGE_OPTIONS,
      value: d.language || "English",
      suggested: d.suggestions?.language || "",
      isRead,
    }),
  ].filter(Boolean);

  const voiceCards = [renderBriefVoiceProfile(d, isRead)].filter(Boolean);

  const brandingCards = [isRead ? renderBriefColor(d, isRead) : "", renderBriefImageVoice(d)].filter(Boolean);

  const renderGroup = (id, label, icon, cards) =>
    cards.length
      ? `
        <section class="context-brief__group" data-brief-group="${id}">
          ${renderBriefGroupHeader({ id, label, icon })}
          ${cards.join("")}
        </section>
      `
      : "";

  const sections = [
    ...nonGroupedTop,
    renderGroup("audience", "Audience", "ap-icon-target", audienceCards),
    renderGroup("voice", "Voice profile", "ap-icon-megaphone", voiceCards),
    renderGroup("branding", "Branding", "ap-icon-view-grid", brandingCards),
  ].filter(Boolean);
  const footer = isRead
    ? `
        <footer class="context-brief__footer">
          <span class="context-brief__footer-spacer"></span>
          <button type="button" class="ap-button stroked grey" data-rpanel-close>
            <span>Close</span>
          </button>
          <button type="button" class="ap-button primary orange" data-brief-edit-mode>
            <i class="ap-icon-pen"></i>
            <span>Edit</span>
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
            class="ap-button mermaid"
            data-brief-save
            ${(d.name || "").trim() ? "" : "disabled"}
          >
            <i class="ap-icon-sparkles-mermaid"></i>
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

// Group header — sticky uppercase label inserted between the three logical
// groups of the brief panel (Audience / Voice profile / Branding). Not a
// card — just a horizontal band that introduces the next set of cards and
// stays pinned at the top of the scroll body while the user reads its
// group (iOS Settings style). See `renderContextBriefView` for the
// section ordering.
function renderBriefGroupHeader({ id, label, icon }) {
  return `
    <div class="context-brief__group-header" data-brief-group="${escapeAttr(id)}">
      <i class="${escapeAttr(icon)}"></i>
      <span class="context-brief__group-label">${escapeText(label)}</span>
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

function renderBriefSummaryRead(d) {
  if (!d.businessSummary) return "";
  return `
    <section class="context-brief__section">
      <h3 class="context-brief__title">Business summary</h3>
      ${d.websiteUrl ? `<p class="context-brief__hint">${escapeText(d.websiteUrl)}</p>` : ""}
      <p class="context-brief__readonly-text">${escapeText(d.businessSummary)}</p>
    </section>
  `;
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
            <div class="ap-infobox-message">Green chips were suggested by Archie. Click any to toggle off, or add your own via "Other…".</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderBriefName(d) {
  const colorValue = d.color || "orange";
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
    <section class="context-brief__section context-brief__name-section">
      <h3 class="context-brief__title">Context name &amp; color</h3>
      <p class="context-brief__hint">Shown next to the context in chats and listings.</p>
      <div class="context-brief__name-row">
        <div class="ap-input-group context-brief__name-input">
          <input
            type="text"
            data-brief-name
            value="${escapeAttr(d.name || "")}"
            placeholder="e.g. Acme · Q2 marketing"
          />
        </div>
        <div class="context-brief__color-swatches">${swatches}</div>
      </div>
    </section>
  `;
}

function renderBriefBusinessSummary(d) {
  const text = d.businessSummary || "";
  return `
    <section class="context-brief__section">
      <h3 class="context-brief__title">Does this describe your business correctly?</h3>
      <p class="context-brief__hint">Archie analysed your website and wrote this summary. Edit it directly if anything needs adjusting.</p>
      <span class="context-brief__from-web"><i class="ap-icon-sparkles"></i> Generated from your website</span>
      <div class="ap-textarea-field resizable">
        <textarea data-brief-summary rows="5">${escapeText(text)}</textarea>
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
      ${fromWeb ? `<span class="context-brief__from-web"><i class="ap-icon-web"></i> From your website</span>` : ""}
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
  const cards = ctas
    .map((cta) => {
      const checked = cta.checked ? "checked" : "";
      return `
        <label class="ap-card context-brief__cta-card">
          <label class="ap-checkbox-container">
            <input type="checkbox" data-brief-cta-toggle="${escapeAttr(cta.url)}" ${checked} />
            <i></i>
            <span>${escapeText(cta.label)}<small>${escapeText(cta.url)}</small></span>
          </label>
        </label>
      `;
    })
    .join("");
  return `
    <section class="context-brief__section">
      <h3 class="context-brief__title">Which links should Archie use as CTAs?</h3>
      <p class="context-brief__hint">These URLs will be included in your posts when relevant.</p>
      <span class="context-brief__from-web"><i class="ap-icon-web"></i> From your website</span>
      <div class="context-brief__cta-list">${cards || `<p class="context-brief__hint">No CTA links suggested yet.</p>`}</div>
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
              ? `<img src="${escapeAttr(asset.url)}" alt="${escapeAttr(asset.label || "")}" />`
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
          <h3 class="context-brief__title">Image Voice</h3>
          <p class="context-brief__hint">Brand visual identity extracted from websites</p>
        </div>
      </header>

      <div class="context-brief__iv-site">
        <span class="context-brief__iv-site-favicon"><i class="ap-icon-web"></i></span>
        <div class="context-brief__iv-site-meta">
          <span class="context-brief__iv-site-domain">${escapeText(site.domain || "")}</span>
          <span class="context-brief__iv-site-url">${escapeText(site.url || "")}</span>
        </div>
        <button
          type="button"
          class="ap-icon-button transparent context-brief__iv-site-delete"
          disabled
          aria-disabled="true"
          aria-label="Remove website"
          title="Coming soon"
        >
          <i class="ap-icon-trash"></i>
        </button>
      </div>

      <div class="context-brief__iv-block">
        <h4 class="context-brief__iv-subtitle">Colors</h4>
        <div class="context-brief__iv-colors">
          ${colorRow("Primary", colors.primary)}
          ${colorRow("Accent", colors.accent)}
          ${colorRow("Background", colors.background)}
          ${colorRow("Text Primary", colors.textPrimary)}
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

// Voice profile — richer replacement for the small "tone of voice" chip
// row. Renders a "Voice profile" card with a tones-pill headline and N
// labelled subsections. Each subsection shows a 2-line snippet by default
// with a "Show more" toggle. When expanded in edit mode the body is an
// editable textarea; in read mode it's the full paragraph text.
//
// UI state (which subsections are expanded, whether the whole card is
// collapsed) is module-local — it survives the brief panel's frequent
// re-renders without bleeding into the persisted Context.
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

function renderBriefVoiceProfile(d, isRead) {
  const vp = d?.voiceProfile || {};
  const hasAnyText = VOICE_PROFILE_SECTIONS.some((s) => typeof vp[s.id] === "string" && vp[s.id].trim().length > 0);
  // If no voice profile data and not in edit mode, hide the section
  // entirely (legacy seeds without voiceProfile keep a clean panel).
  if (isRead && !hasAnyText && !vp.headline) return "";

  const tones = Array.isArray(d.tones) ? d.tones.filter(Boolean) : [];
  const headline =
    vp.headline || (tones.length ? tones.join(" · ").toLowerCase() : "Tap a section to refine the voice");

  const collapsed = voiceProfileCollapsed;

  const subSectionHtml = VOICE_PROFILE_SECTIONS.map((s) => {
    const value = typeof vp[s.id] === "string" ? vp[s.id] : "";
    const isExpanded = voiceProfileExpanded.has(s.id);
    // In edit mode an empty section can still be opened to type into.
    // In read mode an empty section is skipped (don't show empty cards).
    if (isRead && !value) return "";
    const snippetText = value
      ? value.length > 140 && !isExpanded
        ? value.slice(0, 140).replace(/\s+\S*$/, "") + "…"
        : value
      : isRead
        ? ""
        : "Tap to add a description.";
    const isTruncated = !isExpanded && value && value.length > 140;
    const bodyHtml = isExpanded
      ? isRead
        ? `<p class="context-brief__vp-body">${escapeText(value)}</p>`
        : `
          <div class="ap-textarea-field resizable">
            <textarea
              data-brief-voice-input="${escapeAttr(s.id)}"
              rows="4"
              placeholder="Describe the brand's ${escapeAttr(s.label.toLowerCase())}…"
            >${escapeText(value)}</textarea>
          </div>
        `
      : `<p class="context-brief__vp-snippet ${value ? "" : "is-empty"}">${escapeText(snippetText)}</p>`;
    const toggleLabel = isExpanded ? (isRead ? "Show less" : "Done") : value ? "Show more" : "Add";
    const showToggle = isExpanded || isTruncated || (!isRead && !value);
    return `
      <div class="context-brief__vp-section" data-voice-section="${escapeAttr(s.id)}">
        <div class="context-brief__vp-section-head">
          <i class="${escapeAttr(s.icon)}"></i>
          <span class="context-brief__vp-section-label">${escapeText(s.label)}</span>
        </div>
        ${bodyHtml}
        ${
          showToggle
            ? `<button
                  type="button"
                  class="context-brief__vp-toggle"
                  data-brief-voice-toggle="${escapeAttr(s.id)}"
                >${escapeText(toggleLabel)}</button>`
            : ""
        }
      </div>
    `;
  })
    .filter(Boolean)
    .join("");

  return `
    <section class="context-brief__section context-brief__voice-profile ${collapsed ? "is-collapsed" : ""}">
      <header class="context-brief__vp-header">
        <button
          type="button"
          class="context-brief__vp-collapse"
          data-brief-voice-card-toggle
          aria-expanded="${collapsed ? "false" : "true"}"
        >
          <i class="ap-icon-chevron-${collapsed ? "right" : "down"}"></i>
        </button>
        <i class="ap-icon-megaphone context-brief__vp-icon"></i>
        <h3 class="context-brief__title">Voice profile</h3>
      </header>
      ${
        collapsed
          ? ""
          : `
        <div class="context-brief__vp-headline">
          <i class="ap-icon-sparkles"></i>
          <span>${escapeText(headline)}</span>
        </div>
        <div class="context-brief__vp-sections">${subSectionHtml}</div>
      `
      }
    </section>
  `;
}
