import { html, raw } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=47";
import { renderIdeaCard } from "../components/idea-card.js?v=25";
import { ideas as MOCK_IDEAS } from "../mocks.js?v=31";

// Sources moved to a per-session model — there's no workspace-wide
// source list on this standalone /ideas page. idea-card renders source
// chips only when it can resolve a sourceId; passing [] hides chips.
const SOURCES = [];
import { isNewUser } from "../user-mode.js?v=21";
import { renderEmptyState } from "../components/empty-state.js?v=1";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=22";

// Lot 15 — empty out in first-time mode so /ideas mirrors the dashboard's
// own first-run UX. Returning user gets the full seed.
const IDEAS = isNewUser() ? [] : MOCK_IDEAS;

// Ideas library — standalone page (handoff §2.3).
// Header → kind filter rail + search + sort → grid of IdeaCards.
// "Use" / "Draft" actions are owned by renderIdeaCard so the visual
// treatment stays consistent with the in-session Content tab.

const KIND_FILTERS = [
  { id: "all", label: "All" },
  { id: "hook", label: "Hooks" },
  { id: "stat", label: "Stats" },
  { id: "quote", label: "Quotes" },
  { id: "story", label: "Stories" },
  { id: "insight", label: "Insights" },
];

const SORTS = [
  { id: "recent", label: "Most recent" },
  { id: "used", label: "Most used" },
  { id: "unused", label: "Unused first" },
];

let pageState = { kind: "all", query: "", sort: "recent" };

export function renderIdeas(_params, target) {
  renderTopbar();
  pageState = { kind: "all", query: "", sort: "recent" };
  paint(target);
}

function paint(target) {
  target.innerHTML = html`<section class="screen ideas-view">${raw(renderPage())}</section>`;
  bind(target);
}

function renderPage() {
  const total = IDEAS.length;
  const used = IDEAS.filter((i) => (i.used || 0) > 0).length;
  const unused = total - used;
  const counts = countByKind();
  const visible = filterAndSort(IDEAS, pageState);

  return html`
    <div class="ideas-view__page">
      <header class="ideas-view__head">
        <div class="ideas-view__head-text">
          <div class="screen__placeholder-eyebrow">Library</div>
          <h1 class="ideas-view__title">Ideas</h1>
          <p class="ideas-view__sub">${total} ideas · ${used} used in posts · ${unused} unused</p>
        </div>
        <div class="ideas-view__head-actions">
          <button type="button" class="ap-button stroked grey" data-ideas-remine>
            <i class="ap-icon-refresh"></i>
            <span>Re-mine sources</span>
          </button>
          <button type="button" class="ap-button primary orange" data-ideas-new>
            <i class="ap-icon-plus"></i>
            <span>New idea</span>
          </button>
        </div>
      </header>

      <div class="ideas-view__toolbar">
        <div class="ideas-view__filters" role="tablist">
          ${raw(
            KIND_FILTERS.map(
              (k) => `
                <button
                  type="button"
                  class="ideas-view__filter ${pageState.kind === k.id ? "is-on" : ""}"
                  data-ideas-filter="${k.id}"
                  role="tab"
                  aria-selected="${pageState.kind === k.id}"
                >${k.label} <span class="ideas-view__filter-count">${counts[k.id] ?? 0}</span></button>
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

      <div class="ideas-view__body">
        ${visible.length === 0
          ? raw(renderIdeasEmpty(IDEAS, pageState))
          : raw(`<div class="ideas-view__grid">${visible.map((i) => renderIdeaCard(i, SOURCES)).join("")}</div>`)}
      </div>
    </div>
  `;
}

// FIND-B3: rich empty state mirroring sources.js — three branches so the
// user gets actionable copy depending on whether the page is genuinely
// empty (first run / re-mine pending) or just filter-narrow.
function renderIdeasEmpty(allIdeas, pageState) {
  const hasFilter = pageState.kind !== "all" || (pageState.query || "").trim().length > 0;
  if (allIdeas.length === 0) {
    return renderEmptyState({
      icon: "ap-icon-sparkles",
      title: "No ideas yet",
      body: "Add a source — Archie extracts hooks, stats, quotes, and stories you can use to draft posts.",
      actionHtml: `<button type="button" class="ap-button primary orange" data-ideas-add-source><i class="ap-icon-plus"></i><span>Add a source</span></button>`,
      wrapperClass: "ideas-view__empty ideas-view__empty--rich",
    });
  }
  if (hasFilter) {
    return renderEmptyState({
      icon: "ap-icon-search",
      title: "No ideas match",
      body: pageState.query
        ? `No idea matches "${escapeText(pageState.query)}". Try a different term.`
        : "No idea matches the active filter.",
      actionHtml: `<button type="button" class="ap-button stroked grey" data-ideas-clear-filters>Clear filters</button>`,
      wrapperClass: "ideas-view__empty ideas-view__empty--rich",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-sparkles",
    title: "No ideas to show",
    body: "Once your sources finish processing, ideas land here.",
    wrapperClass: "ideas-view__empty ideas-view__empty--rich",
  });
}

function escapeText(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function countByKind() {
  const counts = { all: IDEAS.length };
  for (const i of IDEAS) {
    counts[i.kind] = (counts[i.kind] || 0) + 1;
  }
  return counts;
}

function filterAndSort(list, { kind, query, sort }) {
  const q = (query || "").trim().toLowerCase();
  const filtered = list
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

function bind(root) {
  root.addEventListener("click", (event) => {
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
      pageState.query = "";
      paint(root);
      return;
    }
    if (event.target.closest("[data-ideas-new]") || event.target.closest("[data-ideas-remine]")) {
      // Wired in a follow-up — surface a placeholder toast for now so the
      // user knows the click registered.
      import("../components/toast.js?v=20").then(({ showToast }) =>
        showToast("This action lands in a follow-up — pinning the page surface first."),
      );
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-ideas-search]")) {
      pageState.query = event.target.value || "";
      // Repaint the body in place — covers both the grid -> empty and
      // empty -> grid transitions while leaving the search input
      // untouched so focus + caret stay alive.
      const body = root.querySelector(".ideas-view__body");
      if (body) {
        const visible = filterAndSort(IDEAS, pageState);
        body.innerHTML =
          visible.length === 0
            ? renderIdeasEmpty(IDEAS, pageState)
            : `<div class="ideas-view__grid">${visible.map((i) => renderIdeaCard(i, SOURCES)).join("")}</div>`;
      }
    }
  });

  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-ideas-sort]")) {
      pageState.sort = event.target.value;
      paint(root);
    }
  });
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
