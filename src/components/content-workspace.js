// Shared "Content" workspace — used by both the dashboard's start screen
// and the in-session Content tab. Same UI in both places (header with
// counts, search input, sort dropdown, By source / All ideas tabs, body
// of cards).
//
// State (search query + sort) lives module-locally, shared across screens
// so the user's filter persists when they navigate from start screen into
// a session and back.
//
// Public API:
//   contentState                                — { q, sort } shared state
//   renderContentWorkspace({ sources, ideas, view, headerActions,
//                            sourceSelection, sourcesBulkBar,
//                            ideaSelection, ideasBulkBar })
//                                                — full HTML render
//   rerenderContentWorkspaceBody(root, { ...same options... })
//                                                — partial re-render (body
//                                                  + counter pills + bulk bar)
//                                                  so the search input keeps
//                                                  focus
//
// `sourceSelection` / `ideaSelection` are optional Set<id>. When provided,
// the matching cards render in selectable mode (leading checkbox; selected
// cards highlight). `sourcesBulkBar` / `ideasBulkBar` are the HTML of the
// sticky action bar shown at the top of each view's body when the matching
// selection is non-empty. Both bars are caller-built so they can own their
// own data-* hooks and copy (see library-actions.renderSourcesBulkBar /
// renderIdeasBulkBar).
//
// Caller wires its own input/change listeners and calls
// rerenderContentWorkspaceBody(...) on each tick.

import { html, raw } from "../utils.js?v=20";
import { renderSourceCard } from "./source-card.js?v=33";
import { renderIdeaCard } from "./idea-card.js?v=27";
import { renderEmptyState } from "./empty-state.js?v=1";

export const contentState = { q: "", sort: "potential" };

// ─── Filters / sort ───────────────────────────────────────────────────────

function filterContent(sources, ideas, search) {
  const lower = (search || "").toLowerCase();
  const matches = (text) => !lower || (text || "").toLowerCase().includes(lower);
  const filteredIdeas = ideas.filter((i) => matches(i.title) || matches(i.body) || matches(i.rationale));
  const filteredSources = sources.filter((s) => {
    if (matches(s.filename) || matches(s.kind)) return true;
    return ideas.some((i) => (i.sourceIds || []).includes(s.id) && (matches(i.title) || matches(i.body)));
  });
  return { filteredIdeas, filteredSources };
}

function sortIdeas(ideas, sort) {
  const copy = ideas.slice();
  if (sort === "newest") return copy;
  if (sort === "source") {
    return copy.sort((a, b) =>
      String((a.sourceIds || [])[0] || "").localeCompare(String((b.sourceIds || [])[0] || "")),
    );
  }
  if (sort === "state") {
    const rank = { Pinned: 0, Reviewed: 1, Generated: 2, New: 3 };
    return copy.sort((a, b) => (rank[a.state] ?? 99) - (rank[b.state] ?? 99));
  }
  // default: highest potential
  return copy.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

// ─── Body renderers ───────────────────────────────────────────────────────

function renderBySourceBody(sources, allIdeas, search, selection = null, sessionId = null) {
  if (sources.length === 0) {
    return renderEmptyState({
      icon: "ap-icon-feature-library",
      title: "No sources match",
      body: search ? `No source matches "${search}". Try a different term.` : "No sources yet.",
    });
  }
  const selectable = !!selection;
  return `<div class="stack-sm">${sources
    .map((s) => renderSourceCard(s, allIdeas, { selectable, isSelected: selectable && selection.has(s.id), sessionId }))
    .join("")}</div>`;
}

function renderAllIdeasBody(ideas, allSources, search, selection = null, sessionId = null) {
  if (ideas.length === 0) {
    return renderEmptyState({
      icon: "ap-icon-sparkles",
      title: "No ideas match",
      body: search ? `No idea matches "${search}". Try a different term.` : "No ideas yet.",
    });
  }
  const selectable = !!selection;
  return `<div class="dashboard__ideas-grid">${ideas
    .map((i) => renderIdeaCard(i, allSources, { selectable, isSelected: selectable && selection.has(i.id), sessionId }))
    .join("")}</div>`;
}

// ─── Toolbar (search + sort + view tabs) ─────────────────────────────────

function renderContentToolbar(view, sourcesCount, ideasCount) {
  const sort = contentState.sort;
  const q = contentState.q;
  return `
    <div class="content-workspace__toolbar">
      <div class="ap-input-group content-workspace__search">
        <i class="ap-icon-search"></i>
        <input
          type="text"
          placeholder="Search sources and ideas…"
          value="${q.replace(/"/g, "&quot;")}"
          data-content-search
          aria-label="Search content"
        />
      </div>
      <div class="content-workspace__toolbar-right">
        <label class="content-workspace__sort-label">
          <span class="muted">Sort</span>
          <select class="ap-native-select" data-content-sort aria-label="Sort ideas">
            <option value="potential" ${sort === "potential" ? "selected" : ""}>Highest potential</option>
            <option value="newest" ${sort === "newest" ? "selected" : ""}>Newest</option>
            <option value="source" ${sort === "source" ? "selected" : ""}>Source</option>
            <option value="state" ${sort === "state" ? "selected" : ""}>Workflow state</option>
          </select>
        </label>
      </div>
    </div>
    <div class="ap-tabs content-workspace__view-tabs">
      <div class="ap-tabs-nav">
        <button type="button" class="ap-tabs-tab ${view === "sources" ? "active" : ""}" data-content-view="sources">
          <i class="ap-icon-feature-library"></i>
          <span>By source</span>
          <span class="ap-counter normal ${view === "sources" ? "blue" : "grey"}">${sourcesCount}</span>
        </button>
        <button type="button" class="ap-tabs-tab ${view === "ideas" ? "active" : ""}" data-content-view="ideas">
          <i class="ap-icon-sparkles"></i>
          <span>All ideas</span>
          <span class="ap-counter normal ${view === "ideas" ? "blue" : "grey"}">${ideasCount}</span>
        </button>
      </div>
    </div>
  `;
}

// ─── Full + partial render ───────────────────────────────────────────────

// Returns the full content workspace HTML. When called, applies the live
// contentState (search query + sort) to the passed sources/ideas.
//
// `view` — 'sources' | 'ideas'
// `headerActions` — optional HTML injected to the right of the count meta
//                   (e.g. "+ Add source" button on the dashboard)
// `sourceSelection` / `ideaSelection` — optional Set<id> enabling per-row
//                   checkboxes on the matching view.
// `sourcesBulkBar` / `ideasBulkBar` — optional HTML rendered above the
//                   matching view's cards, sticky, when the caller wants
//                   to surface bulk actions for that selection.
export function renderContentWorkspace({
  sources,
  ideas,
  view,
  headerActions = "",
  sourceSelection = null,
  sourcesBulkBar = "",
  ideaSelection = null,
  ideasBulkBar = "",
  sessionId = null,
}) {
  const search = contentState.q;
  const { filteredSources, filteredIdeas } = filterContent(sources, ideas, search);
  const sortedIdeas = sortIdeas(filteredIdeas, contentState.sort);
  const isSources = view === "sources";
  const cardsHtml = isSources
    ? renderBySourceBody(filteredSources, ideas, search, sourceSelection, sessionId)
    : renderAllIdeasBody(sortedIdeas, sources, search, ideaSelection, sessionId);
  const activeBulkBar = isSources ? sourcesBulkBar : ideasBulkBar;
  return html`
    <section class="content-workspace">
      <header class="content-workspace__header">
        <div class="row-between">
          <h2 class="text-section">Content</h2>
          <div class="content-workspace__header-right">
            <span class="muted">
              ${sources.length} source${sources.length === 1 ? "" : "s"} · ${ideas.length}
              idea${ideas.length === 1 ? "" : "s"}
            </span>
            ${raw(headerActions)}
          </div>
        </div>
        ${raw(renderContentToolbar(view, filteredSources.length, filteredIdeas.length))}
      </header>
      <div class="content-workspace__body" data-content-body>
        <div class="content-workspace__bulk-slot" data-bulk-slot>${raw(activeBulkBar)}</div>
        ${raw(cardsHtml)}
      </div>
    </section>
  `;
}

// Patches the body + counter pills in place. Preserves search input focus
// and cursor position because the input itself is left untouched.
export function rerenderContentWorkspaceBody(
  root,
  {
    sources,
    ideas,
    view,
    sourceSelection = null,
    sourcesBulkBar = "",
    ideaSelection = null,
    ideasBulkBar = "",
    sessionId = null,
  },
) {
  const search = contentState.q;
  const { filteredSources, filteredIdeas } = filterContent(sources, ideas, search);
  const sortedIdeas = sortIdeas(filteredIdeas, contentState.sort);
  const body = root.querySelector("[data-content-body]");
  if (body) {
    const isSources = view === "sources";
    const cardsHtml = isSources
      ? renderBySourceBody(filteredSources, ideas, search, sourceSelection, sessionId)
      : renderAllIdeasBody(sortedIdeas, sources, search, ideaSelection, sessionId);
    const activeBulkBar = isSources ? sourcesBulkBar : ideasBulkBar;
    // Re-render preserving the bulk-slot wrapper so partial repaints don't
    // recreate the sticky reference node.
    body.innerHTML = `<div class="content-workspace__bulk-slot" data-bulk-slot>${activeBulkBar}</div>${cardsHtml}`;
  }
  // Update counter pills in place — don't rebuild the tab buttons.
  root.querySelectorAll("[data-content-view]").forEach((t) => {
    const which = t.dataset.contentView;
    const counter = t.querySelector(".ap-counter");
    if (counter) counter.textContent = which === "sources" ? filteredSources.length : filteredIdeas.length;
  });
  // Update the static "N sources · M ideas" header line so it stays in sync
  // when sources land / are deleted / ideas get extracted.
  const headerCount = root.querySelector(".content-workspace__header-right .muted");
  if (headerCount) {
    headerCount.textContent = `${sources.length} source${sources.length === 1 ? "" : "s"} · ${ideas.length} idea${ideas.length === 1 ? "" : "s"}`;
  }
}

// Default empty-state for "no sources, no ideas at all" — both screens
// surface the same message before any content has been ingested. Pass
// `actionHtml` to render a CTA underneath (e.g. "+ Add source"); callers
// that don't have a primary action can omit it.
export function renderContentEmptyState({ actionHtml = "" } = {}) {
  return renderEmptyState({
    icon: "ap-icon-feature-library",
    title: "No content yet",
    body: "Add a PDF, a video, or a URL to get started. Archie processes it and surfaces ideas you can publish.",
    actionHtml,
  });
}
