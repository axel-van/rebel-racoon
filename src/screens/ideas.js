import { html, raw, escapeText, escapeAttr } from "../utils.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=188";
// Same compact idea card as the right-panel Ideas mode.
import { renderCompactIdeaCard } from "../components/idea-card-compact.js?v=2";
import { showToast } from "../components/toast.js?v=20";
import { ideas as MOCK_IDEAS } from "../mocks.js?v=52";

// Sources moved to a per-session model — there's no workspace-wide
// source list on this standalone /ideas page. idea-card renders source
// chips only when it can resolve a sourceId; passing [] hides chips.
const SOURCES = [];
import { isNewUser } from "../user-mode.js?v=22";
import { renderEmptyState } from "../components/empty-state.js?v=1";
import { open as openAddSourceModal } from "../components/add-source-modal.js?v=59";

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

// Per-card interaction state for the compact idea card (feedback thumbs +
// "Why this idea" expand). Page-local — the panel keeps its own copy.
const ideasFeedback = new Map(); // ideaId → "up" | "down"
const ideasWhyOpen = new Set(); // ideaId set = expanded

function renderIdeaGridCard(i) {
  return renderCompactIdeaCard(i, SOURCES, {
    verdict: ideasFeedback.get(i.id) || null,
    whyOpen: ideasWhyOpen.has(i.id),
    // No composer on the standalone Ideas page → no Mention button.
    showMention: false,
  });
}

// Delegated listeners live on `target` (the persistent #app element), so they
// are bound ONCE per screen entry — not on every paint() — and torn down via
// the cleanup the router invokes on navigation. Re-binding inside paint() used
// to stack a fresh set of handlers on each filter/sort/clear repaint.
let onClick = null;
let onInput = null;
let onChange = null;

export function renderIdeas(_params, target) {
  renderTopbar();
  pageState = { kind: "all", query: "", sort: "recent" };
  paint(target);
  bind(target);
  return () => {
    if (onClick) target.removeEventListener("click", onClick);
    if (onInput) target.removeEventListener("input", onInput);
    if (onChange) target.removeEventListener("change", onChange);
    onClick = onInput = onChange = null;
  };
}

function paint(target) {
  target.innerHTML = html`<section class="screen ideas-view">${raw(renderPage())}</section>`;
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
          <h1 class="ideas-view__title">Ideas</h1>
          <p class="ideas-view__sub">${total} ideas · ${used} used in posts · ${unused} unused</p>
        </div>
        <div class="ideas-view__head-actions">
          <button type="button" class="ap-button stroked grey" data-ideas-remine>
            <i class="ap-icon-refresh"></i>
            <span>Re-extract from sources</span>
          </button>
          <button type="button" class="ap-button primary blue" data-ideas-new>
            <i class="ap-icon-plus"></i>
            <span>Create an idea</span>
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

      <div class="ideas-view__body">
        ${visible.length === 0
          ? raw(renderIdeasEmpty(IDEAS, pageState))
          : raw(`<div class="ideas-view__grid">${visible.map((i) => renderIdeaGridCard(i)).join("")}</div>`)}
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
      body: "Add a source and I'll pull out the key messages, facts, quotes, and stories you can turn into posts.",
      actionHtml: `
        <details class="ap-select ideas-view__add-menu">
          <summary class="ap-button primary blue ideas-view__add-trigger">
            <i class="ap-icon-plus" aria-hidden="true"></i><span>Add a source</span>
          </summary>
          <div class="ap-select-dropdown" role="menu" aria-label="Add a source">
            <div class="ap-select-options">
              <div class="ap-select-option" data-ideas-attach-method="upload" role="menuitem">
                <i class="ap-icon-upload" aria-hidden="true"></i><span class="ap-select-option-text">Upload a file</span>
              </div>
              <div class="ap-select-option" data-ideas-attach-method="url" role="menuitem">
                <i class="ap-icon-link" aria-hidden="true"></i><span class="ap-select-option-text">Add a URL</span>
              </div>
              <div class="ap-select-option" data-ideas-attach-method="pasteText" role="menuitem">
                <i class="ap-icon-pen" aria-hidden="true"></i><span class="ap-select-option-text">Paste text</span>
              </div>
            </div>
          </div>
        </details>`,
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
    body: "Ideas will appear here once I finish analyzing your sources.",
    wrapperClass: "ideas-view__empty ideas-view__empty--rich",
  });
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
  onClick = (event) => {
    // --- Compact idea card interactions ---
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
    // Draft — there's no chat session on the standalone Ideas page, so point
    // the user to a chat rather than dead-ending.
    const useBtn = event.target.closest("[data-rpanel-use-idea]");
    if (useBtn) {
      event.preventDefault();
      showToast("Open a chat to draft from this idea.");
      return;
    }

    const filter = event.target.closest("[data-ideas-filter]");
    if (filter) {
      pageState.kind = filter.dataset.ideasFilter;
      paint(root);
      return;
    }
    const ideaAttach = event.target.closest("[data-ideas-attach-method]");
    if (ideaAttach) {
      ideaAttach.closest("details")?.removeAttribute("open");
      openAddSourceModal({ tab: ideaAttach.dataset.ideasAttachMethod });
      return;
    }
    if (event.target.closest("[data-ideas-clear-filters]")) {
      pageState.kind = "all";
      pageState.query = "";
      paint(root);
      return;
    }
    if (event.target.closest("[data-ideas-new]") || event.target.closest("[data-ideas-remine]")) {
      // Not wired yet — silently no-op until a real handler lands.
    }
  };
  root.addEventListener("click", onClick);

  onInput = (event) => {
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
            : `<div class="ideas-view__grid">${visible.map((i) => renderIdeaGridCard(i)).join("")}</div>`;
      }
    }
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
