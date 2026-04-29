import { html, raw } from "../utils.js?v=20";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=23";
import { isFlagOn } from "../feature-flags.js?v=1";
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
  mode: null, // 'drafts' | 'ideas' | null
  activeBatchRef: null, // { sessionId, messageId } | null
};
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

// Open in Drafts mode pinned to a specific assistant message in a session.
// Called by the in-thread Drafts summary card (Lot 4.3).
export function openDrafts(activeBatchRef) {
  state = { mode: "drafts", activeBatchRef: activeBatchRef || state.activeBatchRef };
  rebindThread();
  renderPanel();
  notify();
}

export function openIdeas() {
  state = { ...state, mode: "ideas" };
  renderPanel();
  notify();
}

export function closePanel() {
  state = { ...state, mode: null };
  if (unsubscribeActiveThread) {
    unsubscribeActiveThread();
    unsubscribeActiveThread = null;
  }
  renderPanel();
  notify();
}

export function setMode(mode) {
  if (mode !== "drafts" && mode !== "ideas") return;
  state = { ...state, mode };
  rebindThread();
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
    const networkChip = event.target.closest("[data-rpanel-drafts-network]");
    if (networkChip) {
      draftsNetwork = networkChip.dataset.rpanelDraftsNetwork;
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
    // Use this idea → injects a templated prompt into the assistant composer.
    const useBtn = event.target.closest("[data-rpanel-use-idea]");
    if (useBtn) {
      useIdea(useBtn.dataset.rpanelUseIdea);
      return;
    }
  });
  el.addEventListener("input", (event) => {
    if (event.target.matches("[data-rpanel-ideas-search]")) {
      ideasQuery = event.target.value || "";
      renderIdeasBodyOnly();
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
  const titleIcon = state.mode === "drafts" ? "ap-icon-pen" : "ap-icon-sparkles";
  const titleText = state.mode === "drafts" ? "Drafts" : "Ideas";
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
    <div class="app-right-panel__body">
      ${state.mode === "drafts" ? raw(renderDraftsView()) : raw(renderIdeasView())}
    </div>
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

  const networkRow = (id, label, count) => {
    const active = draftsNetwork === id;
    return `
      <button
        type="button"
        class="posts__filter posts__filter--network ${active ? "is-active" : ""}"
        data-rpanel-drafts-network="${id}"
      >
        <span class="posts__filter-label">${label}</span>
        <span class="posts__filter-count">${count}</span>
      </button>
    `;
  };

  const rail = `
    <aside class="posts__rail" aria-label="Post filters">
      <div class="posts__rail-group">
        ${filterRow("all", "ap-icon-megaphone", "All posts", filterCounts.all)}
        ${filterRow("needs_fixes", "ap-icon-error", "Needs fixes", filterCounts.needs_fixes)}
        ${filterRow("scheduled", "ap-icon-calendar", "Scheduled", filterCounts.scheduled)}
      </div>
      <div class="posts__rail-group">
        <h3 class="posts__rail-heading">Network</h3>
        ${networkRow("all", "All", networkCounts.all)}
        ${networkRow("linkedin", "LinkedIn", networkCounts.linkedin)}
        ${networkRow("twitter", "X", networkCounts.twitter)}
      </div>
    </aside>
  `;

  const feed = filtered.length
    ? filtered.map((p) => renderPostCard(p, { editing: p.id === editingPostId, inlineEdit })).join("")
    : `<div class="app-right-panel__empty">
         <div class="app-right-panel__empty-title">No drafts match this filter</div>
         <div class="app-right-panel__empty-sub">Try another filter, or clear the current one.</div>
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
    return html`<div class="rpanel-ideas__no-match">No ideas match.</div>`;
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
