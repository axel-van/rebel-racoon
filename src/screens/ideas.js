// Ideas library — standalone page (route /ideas).
//
// This page was removed in July 2026 ("ideas now live only inside a session")
// and is back for one reason: research delivers ideas that belong to NO
// conversation. They need somewhere to live that isn't a chat, and the user
// needs to be able to see them all, filter by where they came from, and let a
// batch of unwanted ones go.
//
// Differences from the version that was deleted:
//   • reads library.getAllIdeas() LIVE and re-renders on the research store, so
//     a landed scan shows up without a reload (the old page snapshotted
//     mocks.ideas at module load);
//   • an ORIGIN filter — All / From research / From chats — which is the whole
//     point of the page existing again;
//   • "Write it" works instead of dead-ending in a toast: a research idea gets
//     adopted into a chat and goes straight to drafting;
//   • selection + bulk remove, so a week of unwanted ideas is one gesture.
//
// Kind chips, search, sort and the three-branch empty state are the same as the
// original — they were right the first time.

import { html, raw, escapeText, escapeAttr } from "../utils.js?v=21";
import { navigate } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=228";
import { renderCompactIdeaCard } from "../components/idea-card-compact.js?v=2";
import { renderEmptyState } from "../components/empty-state.js?v=1";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=64";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=22";
import { showToast } from "../components/toast.js?v=20";
import {
  getAllIdeas,
  countIdeasByOrigin,
  removeIdeasGlobally,
  subscribeGlobal as subscribeLibraryGlobal,
} from "../library.js?v=54";
import { subscribe as subscribeResearch, getFinding } from "../research-store.js?v=6";
import { writeIdea } from "../research-flow.js?v=7";
import { isFlagOn } from "../feature-flags.js?v=12";

// Sources are per-session, so there's no workspace-wide source list to resolve
// chips against. renderCompactIdeaCard falls back to `idea.ref` when it can't
// resolve a sourceId, which is why passing [] is safe.
const SOURCES = [];

const KIND_FILTERS = [
  { id: "all", label: "All" },
  { id: "hook", label: "Hooks" },
  { id: "stat", label: "Stats" },
  { id: "quote", label: "Quotes" },
  { id: "story", label: "Stories" },
  { id: "insight", label: "Insights" },
];

// Only shown when research is on — without it every idea comes from a chat and
// the filter would be a one-option control.
const ORIGIN_FILTERS = [
  { id: "all", label: "All" },
  { id: "research", label: "From research" },
  { id: "session", label: "From chats" },
];

const SORTS = [
  { id: "recent", label: "Most recent" },
  { id: "used", label: "Most used" },
  { id: "unused", label: "Unused first" },
];

let pageState = { kind: "all", origin: "all", query: "", sort: "recent" };
let selection = new Set();
let unsubscribe = null;
let unsubscribeLibrary = null;

// Per-card interaction state for the compact card (feedback thumbs + "Why this
// idea" expand). Page-local — the right panel keeps its own copy.
const ideasFeedback = new Map();
const ideasWhyOpen = new Set();

let onClick = null;
let onInput = null;
let onChange = null;

export function renderIdeas(_params, target) {
  // Gated on `research` like the nav entry: this page exists BECAUSE research
  // delivers ideas that belong to no chat. With the flag off, leaving the route
  // reachable would silently reverse the decision to remove it.
  if (!isFlagOn("research")) {
    navigate("/");
    return;
  }
  renderTopbar();
  pageState = { kind: "all", origin: "all", query: "", sort: "recent" };
  selection = new Set();
  paint(target);
  bind(target);
  // A scan publishes ideas into the library, so the page has to repaint on it.
  unsubscribe = subscribeResearch(() => paint(target));
  unsubscribeLibrary = subscribeLibraryGlobal(() => paint(target));

  return () => {
    if (onClick) target.removeEventListener("click", onClick);
    if (onInput) target.removeEventListener("input", onInput);
    if (onChange) target.removeEventListener("change", onChange);
    onClick = onInput = onChange = null;
    unsubscribe?.();
    unsubscribeLibrary?.();
    unsubscribe = unsubscribeLibrary = null;
  };
}

function paint(target) {
  target.innerHTML = html`<section class="screen ideas-view">${raw(renderPage())}</section>`;
}

// ── Render ────────────────────────────────────────────────────────────────

function renderIdeaGridCard(idea) {
  const selected = selection.has(idea.id);
  const fromResearch = (idea.origin || "session") === "research";
  const finding = fromResearch && idea.researchFindingId ? getFinding(idea.researchFindingId) : null;

  return html`<div class="ideas-view__card-wrap">
    <div class="ideas-view__origin-tag">
      <label class="ideas-view__select">
        <input type="checkbox" class="ap-checkbox" ${raw(selected ? "checked" : "")} data-idea-select="${idea.id}" />
      </label>
      ${raw(
        fromResearch
          ? html`<i class="ap-icon-feature-listening" aria-hidden="true"></i>
              <span>From research${raw(finding ? ` · ${escapeText(finding.headline)}` : "")}</span>`
          : html`<span>From a chat</span>`,
      )}
    </div>
    ${raw(
      renderCompactIdeaCard(idea, SOURCES, {
        verdict: ideasFeedback.get(idea.id) || null,
        whyOpen: ideasWhyOpen.has(idea.id),
        // No composer on a standalone page → no Mention button.
        showMention: false,
      }),
    )}
  </div>`;
}

function renderBulkBar() {
  const n = selection.size;
  if (n === 0) return "";
  return html`<div class="ideas-view__bulk">
    <span class="ideas-view__bulk-count">${n} selected</span>
    <div class="ideas-view__bulk-actions">
      <button type="button" class="ap-button ghost grey" data-ideas-bulk-clear>Cancel</button>
      <button type="button" class="ap-button stroked red" data-ideas-bulk-remove>
        <i class="ap-icon-trash"></i>
        <span>Remove</span>
      </button>
    </div>
  </div>`;
}

function renderPage() {
  const all = getAllIdeas();
  const byOrigin = countIdeasByOrigin();
  const total = all.length;
  const used = all.filter((i) => (i.used || 0) > 0).length;
  const counts = countByKind(all);
  const visible = filterAndSort(all, pageState);
  const researchOn = isFlagOn("research");

  const sub = researchOn
    ? `${total} ideas · ${byOrigin.research} from research · ${used} used in posts`
    : `${total} ideas · ${used} used in posts · ${total - used} unused`;

  return html`
    <div class="ideas-view__page">
      <header class="ideas-view__head">
        <div class="ideas-view__head-text">
          <h1 class="ideas-view__title">Ideas</h1>
          <p class="ideas-view__sub">${sub}</p>
        </div>
      </header>

      <div class="ideas-view__toolbar">
        <div class="ideas-view__filters" role="tablist">
          ${raw(
            researchOn
              ? `<div class="ideas-view__origins">${ORIGIN_FILTERS.map(
                  (o) => `
                <button
                  type="button"
                  class="ap-filter-chip"
                  data-ideas-origin="${o.id}"
                  aria-pressed="${pageState.origin === o.id}"
                >
                  <span>${o.label}</span>
                  <span class="ap-filter-chip-count">${o.id === "all" ? byOrigin.all : byOrigin[o.id]}</span>
                </button>`,
                ).join("")}</div><span class="ideas-view__origin-sep" aria-hidden="true"></span>`
              : "",
          )}
          ${raw(
            KIND_FILTERS.map(
              (k) => `
                <button
                  type="button"
                  class="ap-filter-chip"
                  data-ideas-filter="${k.id}"
                  role="tab"
                  aria-pressed="${pageState.kind === k.id}"
                  aria-selected="${pageState.kind === k.id}"
                >
                  <span>${k.label}</span>
                  <span class="ap-filter-chip-count">${counts[k.id] ?? 0}</span>
                </button>
              `,
            ).join(""),
          )}
        </div>
        <div class="ideas-view__toolbar-right">
          <div class="ap-input-group ideas-view__search">
            <i class="ap-icon-search"></i>
            <input
              type="search"
              class="ap-input"
              placeholder="Search ideas…"
              value="${escapeAttr(pageState.query)}"
              data-ideas-search
            />
          </div>
          <select class="ap-native-select ideas-view__sort" data-ideas-sort>
            ${raw(
              SORTS.map(
                (s) => `<option value="${s.id}" ${pageState.sort === s.id ? "selected" : ""}>${s.label}</option>`,
              ).join(""),
            )}
          </select>
        </div>
      </div>

      <div class="ideas-view__bulk-host" data-ideas-bulk-host>${raw(renderBulkBar())}</div>

      <div class="ideas-view__body">
        ${visible.length === 0
          ? raw(renderIdeasEmpty(all, pageState))
          : raw(`<div class="ideas-view__grid">${visible.map((i) => renderIdeaGridCard(i)).join("")}</div>`)}
      </div>
    </div>
  `;
}

// Three branches so the copy is actionable: genuinely empty (first run),
// filter-narrow, or nothing to show.
function renderIdeasEmpty(allIdeas, state) {
  const hasFilter = state.kind !== "all" || state.origin !== "all" || (state.query || "").trim().length > 0;
  if (allIdeas.length === 0) {
    return renderEmptyState({
      icon: "ap-icon-sparkles",
      title: "No ideas yet",
      body: "Add a source and I'll pull out the key messages, facts, quotes and stories you can turn into posts.",
      actionHtml: `<button type="button" class="ap-button primary blue" data-ideas-add-source><i class="ap-icon-plus" aria-hidden="true"></i><span>Add a source</span></button>`,
      wrapperClass: "ideas-view__empty ideas-view__empty--rich",
    });
  }
  if (hasFilter) {
    return renderEmptyState({
      icon: "ap-icon-search",
      title: "No ideas match",
      body: state.query
        ? `No idea matches "${escapeText(state.query)}". Try a different term.`
        : "No idea matches the active filters.",
      actionHtml: `<button type="button" class="ap-button stroked grey" data-ideas-clear-filters>Clear filters</button>`,
      wrapperClass: "ideas-view__empty ideas-view__empty--rich",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-sparkles",
    title: "No ideas to show",
    body: "Ideas will appear here once I finish analyzing your sources.",
    wrapperClass: "ideas-view__empty ideas-view__empty--rich",
  });
}

// Patch just the bulk bar. Called on every selection change; the grid stays put.
function syncBulkBar(root) {
  const host = root.querySelector("[data-ideas-bulk-host]");
  if (host) host.innerHTML = renderBulkBar();
}

function countByKind(all) {
  const counts = { all: all.length };
  for (const i of all) counts[i.kind] = (counts[i.kind] || 0) + 1;
  return counts;
}

function filterAndSort(list, { kind, origin, query, sort }) {
  const q = (query || "").trim().toLowerCase();
  const filtered = list
    .filter((i) => origin === "all" || (i.origin || "session") === origin)
    .filter((i) => kind === "all" || i.kind === kind)
    .filter((i) => !q || (i.body || "").toLowerCase().includes(q) || (i.title || "").toLowerCase().includes(q));
  switch (sort) {
    case "used":
      return [...filtered].sort((a, b) => (b.used || 0) - (a.used || 0));
    case "unused":
      return [...filtered].sort((a, b) => (a.used || 0) - (b.used || 0));
    case "recent":
    default:
      return filtered;
  }
}

// ── Events ────────────────────────────────────────────────────────────────

// Bound ONCE on the persistent #app target and torn down by the cleanup the
// router invokes — re-binding inside paint() used to stack handlers.
function bind(root) {
  onClick = (event) => {
    // Thumbs feedback — exclusive toggle, in place (no repaint).
    const feedbackBtn = event.target.closest("[data-rpanel-ideas-feedback]");
    if (feedbackBtn) {
      event.preventDefault();
      const card = feedbackBtn.closest(".rpanel-ideas__card");
      const id = feedbackBtn.dataset.rpanelIdeasFeedback;
      const side = feedbackBtn.dataset.verdict;
      const wasActive = ideasFeedback.get(id) === side;
      card?.querySelectorAll("[data-rpanel-ideas-feedback]").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
        const i = b.querySelector("i");
        if (i) i.className = b.dataset.verdict === "up" ? "ap-icon-thumb-up" : "ap-icon-thumb-down";
      });
      if (wasActive) {
        ideasFeedback.delete(id);
      } else {
        ideasFeedback.set(id, side);
        feedbackBtn.classList.add("is-active");
        feedbackBtn.setAttribute("aria-pressed", "true");
        const i = feedbackBtn.querySelector("i");
        if (i) i.className = `ap-icon-thumb-${side}_fill`;
      }
      return;
    }

    // "Why this idea" — expand / collapse in place.
    const whyBtn = event.target.closest("[data-rpanel-idea-why-toggle]");
    if (whyBtn) {
      event.preventDefault();
      const id = whyBtn.dataset.rpanelIdeaWhyToggle;
      const section = whyBtn.closest(".rpanel-ideas__why");
      const next = section?.getAttribute("data-why-open") !== "true";
      if (next) ideasWhyOpen.add(id);
      else ideasWhyOpen.delete(id);
      if (section) section.setAttribute("data-why-open", next ? "true" : "false");
      whyBtn.setAttribute("aria-expanded", next ? "true" : "false");
      const body = document.getElementById(whyBtn.getAttribute("aria-controls"));
      if (body) body.hidden = !next;
      const chev = whyBtn.querySelector(".rpanel-ideas__why-chevron");
      if (chev) {
        chev.classList.toggle("ap-icon-chevron-down", !next);
        chev.classList.toggle("ap-icon-chevron-up", next);
      }
      return;
    }

    // Draft — the old page dead-ended here with "Open a chat to draft from this
    // idea." It works now: writeIdea asks which chat, adopts the idea and
    // starts the draft flow.
    const useBtn = event.target.closest("[data-rpanel-use-idea]");
    if (useBtn) {
      event.preventDefault();
      writeIdea(useBtn.dataset.rpanelUseIdea);
      return;
    }

    const select = event.target.closest("[data-idea-select]");
    if (select) {
      const id = select.dataset.ideaSelect;
      if (selection.has(id)) selection.delete(id);
      else selection.add(id);
      // In place, deliberately: a full repaint would detach every other
      // checkbox mid-selection and reset the scroll position.
      syncBulkBar(root);
      return;
    }

    if (event.target.closest("[data-ideas-bulk-clear]")) {
      selection = new Set();
      root.querySelectorAll("[data-idea-select]").forEach((b) => {
        b.checked = false;
      });
      syncBulkBar(root);
      return;
    }

    if (event.target.closest("[data-ideas-bulk-remove]")) {
      const ids = [...selection];
      const n = ids.length;
      openConfirmModal({
        title: n === 1 ? "Remove this idea?" : `Remove ${n} ideas?`,
        body: "They'll go from here and from any chat holding them. Ideas from research won't come back.",
        confirmLabel: "Remove",
        danger: true,
        onConfirm: () => {
          // Clear the selection FIRST: removeIdeasGlobally notifies
          // synchronously, and the repaint that follows reads `selection` — so
          // clearing after would render the bulk bar back with stale ids.
          selection = new Set();
          const removed = removeIdeasGlobally(ids);
          showToast(`${removed} ${removed === 1 ? "idea" : "ideas"} removed`);
        },
      });
      return;
    }

    const origin = event.target.closest("[data-ideas-origin]");
    if (origin) {
      pageState.origin = origin.dataset.ideasOrigin;
      paint(root);
      return;
    }

    const filter = event.target.closest("[data-ideas-filter]");
    if (filter) {
      pageState.kind = filter.dataset.ideasFilter;
      paint(root);
      return;
    }

    if (event.target.closest("[data-ideas-add-source]")) {
      openAddSourceModal({ tab: "upload" });
      return;
    }

    if (event.target.closest("[data-ideas-clear-filters]")) {
      pageState.kind = "all";
      pageState.origin = "all";
      pageState.query = "";
      paint(root);
    }
  };
  root.addEventListener("click", onClick);

  onInput = (event) => {
    if (!event.target.matches("[data-ideas-search]")) return;
    pageState.query = event.target.value || "";
    // Repaint the body in place so the input keeps focus and caret.
    const body = root.querySelector(".ideas-view__body");
    if (!body) return;
    const all = getAllIdeas();
    const visible = filterAndSort(all, pageState);
    body.innerHTML =
      visible.length === 0
        ? renderIdeasEmpty(all, pageState)
        : `<div class="ideas-view__grid">${visible.map((i) => renderIdeaGridCard(i)).join("")}</div>`;
  };
  root.addEventListener("input", onInput);

  onChange = (event) => {
    if (event.target.matches("[data-ideas-sort]")) {
      pageState.sort = event.target.value;
      paint(root);
    }
  };
  root.addEventListener("change", onChange);
}
