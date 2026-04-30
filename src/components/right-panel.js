import { html, raw } from "../utils.js?v=20";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=23";
import { isFlagOn } from "../feature-flags.js?v=2";
import { ideas as MOCK_IDEAS } from "../mocks.js?v=25";
import { isNewUser } from "../user-mode.js?v=20";
import { getPath } from "../router.js?v=20";
import {
  getPosts,
  addPostDraft,
  removePost,
  insertPost,
  updatePostContent,
  subscribe as subscribePostsStore,
} from "../posts-store.js?v=23";
import { renderPostCard } from "./post-card.js?v=22";
import { CONTEXT_QUESTIONS } from "../context-questions.js?v=20";
import { isSidebarCollapsed, setSidebarCollapsed } from "./sidebar.js?v=30";

// Lot 15 — empty in first-time mode so the right-panel Ideas surface lines
// up with the rest of the chrome (sidebar Recent list = empty, dashboard
// = first-run welcome). Returning user gets the full seed.
const IDEAS = isNewUser() ? [] : MOCK_IDEAS;
import { open as openScheduleModal } from "./schedule-modal.js?v=20";
import { open as openGenerateImageModal } from "./generate-image-modal.js?v=20";

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

export function closePanel() {
  // Notify the context-form caller so it can release any per-session state
  // (typically the in-progress draft in context-builder). We let the
  // caller decide whether to discard or persist; the panel just signals
  // that the user closed it.
  if (state.mode === "context-form") {
    contextFormConfig?.onCancel?.();
    contextFormConfig = null;
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
    // Drafts mode renders rich PostCards + per-card action stack — needs
    // a wider panel column than the compact Ideas list. Toggle a marker
    // class on the shell ; layout.css picks it up to swap the grid
    // template column from the default 460px to ~720px.
    shell.classList.toggle("is-right-panel-wide", state.mode === "drafts");
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
  let titleText = "Ideas";
  if (state.mode === "drafts") {
    titleIcon = "ap-icon-pen";
    titleText = "Drafts";
  } else if (state.mode === "context-form") {
    titleIcon = "ap-icon-target";
    const isRead = contextFormConfig?.mode === "read";
    if (isRead) {
      const ctx = contextFormConfig.getCtx?.();
      titleText = ctx?.name || "Context";
    } else {
      const draft = contextFormConfig?.getDraft?.();
      titleText = draft?.name?.trim() || "Build your context";
    }
  }
  // The context-form view manages its own scrolling body + sticky footer
  // (so Save sits flush at the bottom). Drafts/Ideas keep the historical
  // .app-right-panel__body wrapper.
  const bodyHtml =
    state.mode === "context-form"
      ? renderContextFormView()
      : `<div class="app-right-panel__body">${state.mode === "drafts" ? renderDraftsView() : renderIdeasView()}</div>`;

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

function renderIdeasView() {
  return html`
    <div class="rpanel-ideas">
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
          placeholder="Name this context (e.g. Acme · Q3)"
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
        <span>Save context</span>
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
