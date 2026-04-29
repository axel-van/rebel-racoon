import { html, raw } from "../utils.js?v=20";
import { getThread, subscribe as subscribeThread } from "../assistant.js?v=23";
import { ideas as MOCK_IDEAS } from "../mocks.js?v=25";
import { isNewUser } from "../user-mode.js?v=20";
import { getPath } from "../router.js?v=20";
import {
  getPosts,
  addPostDraft,
  removePost,
  insertPost,
  subscribe as subscribePostsStore,
} from "../posts-store.js?v=22";
import { renderPostCard } from "./post-card.js?v=20";

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
  el.addEventListener("click", (event) => {
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

const DRAFTS_FILTERS = [
  { id: "all", label: "All posts", icon: "ap-icon-megaphone" },
  { id: "needs_fixes", label: "Needs fixes", icon: "ap-icon-error" },
  { id: "scheduled", label: "Scheduled", icon: "ap-icon-calendar" },
];

const DRAFTS_NETWORKS = [
  { id: "all", label: "All networks" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "X" },
];

function renderDraftsView() {
  const sid = activeSessionId();
  const allPosts = sid ? getPosts(sid) : [];
  if (!allPosts.length) return renderDraftsEmpty();

  // Counts per status / per network — drive the filter chip badges.
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

  const filterChips = DRAFTS_FILTERS.map((f) => {
    const active = draftsFilter === f.id;
    const count = filterCounts[f.id] ?? 0;
    return `
      <button
        type="button"
        class="ap-button ${active ? "secondary blue" : "ghost grey"} rpanel-drafts__chip"
        data-rpanel-drafts-filter="${f.id}"
        aria-pressed="${active}"
      >
        <i class="${f.icon}" aria-hidden="true"></i>
        <span>${f.label}</span>
        <span class="ap-counter normal grey">${count}</span>
      </button>
    `;
  }).join("");

  const networkChips = DRAFTS_NETWORKS.map((n) => {
    const active = draftsNetwork === n.id;
    const count = networkCounts[n.id] ?? 0;
    return `
      <button
        type="button"
        class="ap-button ${active ? "secondary blue" : "ghost grey"} rpanel-drafts__chip"
        data-rpanel-drafts-network="${n.id}"
        aria-pressed="${active}"
      >
        <span>${n.label}</span>
        <span class="ap-counter normal grey">${count}</span>
      </button>
    `;
  }).join("");

  const feed = filtered.length
    ? filtered.map((p) => renderPostCard(p)).join("")
    : `<div class="app-right-panel__empty">
         <div class="app-right-panel__empty-title">No drafts match this filter</div>
         <div class="app-right-panel__empty-sub">Try another filter, or clear the current one.</div>
       </div>`;

  return html`
    <div class="rpanel-drafts">
      <div class="rpanel-drafts__filters">
        <div class="rpanel-drafts__filter-group" role="group" aria-label="Filter by status">${raw(filterChips)}</div>
        <div class="rpanel-drafts__filter-group" role="group" aria-label="Filter by network">${raw(networkChips)}</div>
      </div>
      <div class="rpanel-drafts__feed">${raw(feed)}</div>
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
