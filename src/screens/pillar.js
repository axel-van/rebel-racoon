// One pillar, route /pillar/:id — two tabs.
//
//   Context & assets   the condensed prose Archie carries into a chat, plus the
//                      files you have attached. THE DEFAULT.
//   What went into it  the audit trail: every topic, chat and note, newest
//                      first, each quoted and each removable.
//
// ── Why the split ─────────────────────────────────────────────────────────
// A pillar's job is to hold a point of view. The trail is how you AUDIT that
// view, which is a second-order need — with both on one page the page was mostly
// log, and the thing the pillar actually says scrolled off the top.
//
// The tab's counter is the ONLY announcement in this feature. The banner that
// once sat above the context ("3 things were added this week") is gone on
// purpose: a page whose whole premise is automatic additions does not need a
// notice telling you additions happened.
//
// ── Why every row quotes ──────────────────────────────────────────────────
// A title tells you a topic was matched. An excerpt tells you WHAT PART of it
// the pillar swallowed, which is the only thing anyone can actually judge. A
// note is the user's own text, so it is quoted whole and marked as such — the
// one place in this feature where a model must not restate the input.
//
// ── The scroll ────────────────────────────────────────────────────────────
// The trail owns its own scroll inside a scrolling page, which is the exact trap
// this repo already hit on the new-session hero: a flex child in a max-height
// column SHRINKS, and clamped text collapses to zero height. `flex: 0 0 auto` on
// the rows in pillar.css is load-bearing — see docs/reference/UI-PATTERNS.md.
// Paging is IntersectionObserver on a sentinel, not a "Show all" button.

import { html, raw, escapeAttr } from "../utils.js?v=21";
import { navigate, getPath } from "../router.js?v=30";
import { renderTopbar } from "../components/topbar.js?v=415";
import { showToast } from "../components/toast.js?v=21";
import { isFlagOn } from "../feature-flags.js?v=22";
import { parseHashParams, setHashQuery } from "../url-state.js?v=21";
import { getContextById } from "../contexts-store.js?v=74";
import { open as openPillarModal } from "../components/pillar-modal.js?v=1";
import {
  getPillarById,
  removeSource,
  restoreSource,
  addAsset,
  removeAsset,
  assetKindFor,
  markPillarSeen,
  unseenCountFor,
  updatePillar,
  isRecent,
  subscribe as subscribePillars,
} from "../pillars-store.js?v=1";

const PAGE = 8;

let view = { id: null, tab: "context", visible: PAGE };
let unsubscribe = null;
let boundTarget = null;
let boundClick = null;
let observer = null;
// The unseen count is read ONCE per visit and frozen: marking the sources seen
// on mount is what clears the nav badge, but the tab must keep showing what
// arrived while the user is standing on the page. Without the freeze the number
// vanishes the instant it becomes useful.
let arrivedOnEntry = 0;

export function renderPillar(params, target) {
  if (!isFlagOn("contentStrategy")) {
    navigate("/");
    return;
  }
  const pillar = getPillarById(params.id);
  if (!pillar) {
    navigate("/content-strategy");
    return;
  }
  // parseHashParams returns a URLSearchParams, not a plain object.
  const q = parseHashParams();
  const samePillar = view.id === params.id;
  view = {
    id: params.id,
    tab: q.get("tab") === "sources" ? "sources" : "context",
    // A tab switch is a query-only change and re-runs this handler, so the paging
    // position has to survive it — resetting only when the pillar itself changes.
    visible: samePillar ? view.visible : PAGE,
  };
  if (!samePillar) arrivedOnEntry = unseenCountFor(params.id);
  renderTopbar();
  teardown();
  paint(target);
  bind(target);
  // Opening the pillar is what marks its sources seen — not opening the section.
  // Clearing from the list would wipe a badge whose contents nobody looked at.
  markPillarSeen(params.id);
  // …and an Archie-opened pillar loses its label here, for the same reason: the
  // label means "you have not vetted this yet", not "a machine made it".
  if (pillar.createdBy === "archie" && !pillar.reviewed) updatePillar(params.id, { reviewed: true });
  unsubscribe = subscribePillars(() => paint(target));
  return teardown;
}

function teardown() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (boundTarget && boundClick) boundTarget.removeEventListener("click", boundClick);
  boundTarget = null;
  boundClick = null;
}

function paint(target) {
  const p = getPillarById(view.id);
  if (!p) return;
  target.innerHTML = html`<section class="screen pillar-view">${raw(renderPage(p))}</section>`;
  if (view.tab === "sources") observeSentinel(target);
}

// ─── Render ────────────────────────────────────────────────────────────────

function renderPage(p) {
  const ctx = p.playbookId ? getContextById(p.playbookId) : null;
  return `
    <header class="pillar-view__head">
      <div class="pillar-view__heading">
        <h1 class="ap-h2 pillar-view__title">${escapeAttr(p.name)}</h1>
        <p class="pillar-view__sub">
          ${ctx ? `${escapeAttr(ctx.name)} · ` : ""}context rewritten ${escapeAttr(p.contextUpdatedAgo || "a while ago")}
        </p>
      </div>
      <div class="pillar-view__actions">
        <button type="button" class="ap-button stroked grey" data-pillar-share>
          <i class="ap-icon-share"></i><span>Share</span>
        </button>
        <button type="button" class="ap-button stroked grey" data-pillar-edit>
          <i class="ap-icon-pen"></i><span>Edit</span>
        </button>
      </div>
    </header>
    ${renderTabs(p)}
    ${view.tab === "sources" ? renderSourcesTab(p) : renderContextTab(p)}
  `;
}

// DS Tabs, unmodified: .ap-tabs > .ap-tabs-nav > .ap-tabs-tab.active.
// The counter falls back to the quiet total when nothing arrived — a `notif`
// badge on a zero-delta tab would be claiming attention for a log.
function renderTabs(p) {
  const arrived = arrivedOnEntry;
  const counter = arrived
    ? `<span class="ap-counter notif">${arrived}</span>`
    : `<span class="ap-counter normal grey">${p.sources.length}</span>`;
  return `
    <div class="ap-tabs pillar-tabs">
      <div class="ap-tabs-nav" role="tablist">
        <button type="button" role="tab" class="ap-tabs-tab ${view.tab === "context" ? "active" : ""}"
          aria-selected="${view.tab === "context"}" data-pillar-tab="context">Context &amp; assets</button>
        <button type="button" role="tab" class="ap-tabs-tab ${view.tab === "sources" ? "active" : ""}"
          aria-selected="${view.tab === "sources"}" data-pillar-tab="sources">What went into it ${counter}</button>
      </div>
    </div>`;
}

function renderContextTab(p) {
  return `
    <section class="pillar-sec">
      <h2 class="pillar-sec__title">The context I carry</h2>
      <p class="pillar-sec__prose">${escapeAttr(p.context || p.about || "")}</p>
      <span class="pillar-sec__note">
        Condensed from every topic, chat and note in this pillar. Rewritten ${escapeAttr(p.contextUpdatedAgo || "a while ago")}.
      </span>
    </section>
    ${renderAssets(p)}`;
}

// Assets sit on the CONTEXT tab, not the trail: they describe what the pillar
// HAS, not how it was built. They are also the one shelf in this feature that is
// entirely the user's — nothing is ever filed here automatically, and saying so
// on the surface is what makes the rest of the automatic behaviour tolerable.
function renderAssets(p) {
  const tiles = p.assets.map(
    (a) => `
    <div class="pillar-asset" data-asset-id="${escapeAttr(a.id)}">
      <span class="pillar-asset__thumb pillar-asset__thumb--${escapeAttr(a.kind)}">
        <i class="${a.kind === "image" ? "ap-icon-image" : a.kind === "video" ? "ap-icon-video" : "ap-icon-file"}"></i>
      </span>
      <span class="pillar-asset__name" title="${escapeAttr(a.name)}">${escapeAttr(a.name)}</span>
      <span class="pillar-asset__meta">${escapeAttr(a.size || "")}</span>
      <button type="button" class="ap-icon-button transparent pillar-asset__x"
        data-asset-remove="${escapeAttr(a.id)}" aria-label="Remove ${escapeAttr(a.name)}">
        <i class="ap-icon-close"></i>
      </button>
    </div>`,
  );
  return `
    <section class="pillar-sec">
      <h2 class="pillar-sec__title">Assets <span class="ap-counter normal grey">${p.assets.length}</span></h2>
      <div class="pillar-assets">
        ${tiles.join("")}
        <div class="ap-dropzone ap-dropzone--compact pillar-drop" data-dropzone data-pillar-drop role="button" tabindex="0"
          aria-label="Drop files here, or browse">
          <span class="ap-dropzone__icon"><i class="ap-icon-upload" aria-hidden="true"></i></span>
          <span class="ap-dropzone__text">
            <span class="ap-dropzone__title">Drop files here, or <span class="ap-dropzone__browse">browse</span></span>
            <span class="ap-dropzone__sub">Images, video, PDF, docs</span>
          </span>
          <input type="file" class="ap-dropzone__input" multiple hidden />
        </div>
      </div>
      <span class="pillar-sec__note">
        Assets are yours — I never add or remove one. I use them when drafting from this pillar.
      </span>
    </section>`;
}

function renderSourcesTab(p) {
  const shown = p.sources.slice(0, view.visible);
  const more = p.sources.length - shown.length;
  return `
    <div class="pillar-trail__head">
      <span class="pillar-trail__sort">Newest first</span>
      <span class="pillar-sec__note">Removing a source re-condenses the context without it.</span>
    </div>
    <div class="pillar-trail" data-pillar-trail>
      ${shown.map(renderSourceRow).join("")}
      ${more > 0 ? `<div class="pillar-trail__more" data-pillar-sentinel>Loading more…</div>` : ""}
    </div>
    ${p.sources.length === 0 ? renderTrailEmpty() : ""}`;
}

function renderTrailEmpty() {
  return `
    <p class="pillar-trail__empty">
      Nothing has been filed into this pillar yet. As topics arrive in your feeds and chats touch this theme, I add
      them here — and everything I add says when it landed.
    </p>`;
}

const KIND_LABEL = { topic: "Topic", chat: "Chat", note: "Note" };

function renderSourceRow(s) {
  const note = s.kind === "note";
  return `
    <article class="pillar-row ${isRecent(s) ? "pillar-row--recent" : ""}" data-source-row="${escapeAttr(s.id)}">
      <div class="pillar-row__top">
        <span class="pillar-row__kind pillar-row__kind--${escapeAttr(s.kind)}">${KIND_LABEL[s.kind] || "Source"}</span>
        <span class="pillar-row__title">${escapeAttr(note ? "Written by you · quoted in full" : s.title)}</span>
        <span class="pillar-row__when">Added ${escapeAttr(s.addedAgo)}</span>
        <button type="button" class="ap-button ghost grey pillar-row__x" data-source-remove="${escapeAttr(s.id)}">
          <i class="ap-icon-close"></i><span>Remove</span>
        </button>
      </div>
      <blockquote class="pillar-row__quote ${note ? "pillar-row__quote--full" : ""}">${escapeAttr(s.quote || "")}</blockquote>
    </article>`;
}

// ─── Paging ────────────────────────────────────────────────────────────────
// The sentinel is inside the trail's own scroller, so `root` has to be that
// scroller — with the default (viewport) root it fires immediately on a list
// that is taller than the pane and pages the whole thing in at once.
//
// A plain `scroll` listener backs it up, and that is not belt-and-braces: an
// IntersectionObserver does not run while the document is hidden
// (`visibilityState === "hidden"`), which is exactly the state a background tab
// or an automated browser session is in. Without the fallback the list simply
// stops paging there and looks broken — and it is the only path that can be
// verified without a foreground window.
function observeSentinel(target) {
  if (observer) observer.disconnect();
  const trail = target.querySelector("[data-pillar-trail]");
  const sentinel = target.querySelector("[data-pillar-sentinel]");
  if (!trail || !sentinel) return;
  const more = () => {
    view.visible += PAGE;
    paint(target);
  };
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) more();
    },
    { root: trail, rootMargin: "120px" },
  );
  observer.observe(sentinel);
  trail.addEventListener("scroll", () => {
    if (trail.scrollTop + trail.clientHeight >= trail.scrollHeight - 120) more();
  });
}

// ─── Bind ──────────────────────────────────────────────────────────────────

function bind(target) {
  boundTarget = target;
  boundClick = (event) => {
    const tab = event.target.closest("[data-pillar-tab]");
    if (tab) {
      const next = tab.getAttribute("data-pillar-tab");
      // Query-only navigation, so a link to the trail is shareable and Back
      // works. The default tab writes no param.
      // No key at all for the default tab — URLSearchParams stringifies null to
      // the literal "null", which would put ?tab=null in the address bar.
      setHashQuery(getPath(), next === "sources" ? { tab: "sources" } : {});
      return;
    }
    if (event.target.closest("[data-pillar-edit]")) {
      const p = getPillarById(view.id);
      if (p) openPillarModal({ mode: "edit", pillar: p });
      return;
    }
    if (event.target.closest("[data-pillar-share]")) {
      showToast("Share link copied");
      return;
    }
    const rm = event.target.closest("[data-source-remove]");
    if (rm) {
      const id = rm.getAttribute("data-source-remove");
      const p = getPillarById(view.id);
      const index = p ? p.sources.findIndex((s) => s.id === id) : -1;
      const removed = removeSource(view.id, id);
      if (removed) {
        // Undo rather than a confirm: removing one source is small and repeated,
        // and the snackbar is how Dismiss already works on the Topics feed.
        showToast("Source removed · context rebuilt", {
          action: { label: "Undo", onClick: () => restoreSource(view.id, removed, Math.max(0, index)) },
        });
      }
      return;
    }
    const rmAsset = event.target.closest("[data-asset-remove]");
    if (rmAsset) {
      const removed = removeAsset(view.id, rmAsset.getAttribute("data-asset-remove"));
      if (removed) showToast(`Removed ${removed.name}`);
      return;
    }
    const drop = event.target.closest("[data-pillar-drop]");
    if (drop) {
      const input = drop.querySelector(".ap-dropzone__input");
      if (input) input.click();
      return;
    }
  };
  target.addEventListener("click", boundClick);

  target.addEventListener("change", (event) => {
    const input = event.target.closest(".ap-dropzone__input");
    if (!input || !input.files || !input.files.length) return;
    const names = [...input.files].map((f) => f.name);
    for (const name of names) addAsset(view.id, { name, kind: assetKindFor(name), size: "—" });
    input.value = "";
    showToast(names.length === 1 ? `Added ${names[0]}` : `Added ${names.length} assets`);
  });

  // Drag-and-drop on the dropzone. Not bindDropzone(): that helper wires a
  // stable ancestor and this screen repaints its whole tree on every store
  // notification, so the listeners live on the screen root like every other
  // handler here.
  target.addEventListener("dragover", (event) => {
    const dz = event.target.closest("[data-pillar-drop]");
    if (!dz) return;
    event.preventDefault();
    dz.classList.add("is-dragover");
  });
  target.addEventListener("dragleave", (event) => {
    const dz = event.target.closest("[data-pillar-drop]");
    if (dz) dz.classList.remove("is-dragover");
  });
  target.addEventListener("drop", (event) => {
    const dz = event.target.closest("[data-pillar-drop]");
    if (!dz) return;
    event.preventDefault();
    dz.classList.remove("is-dragover");
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    for (const f of files) addAsset(view.id, { name: f.name, kind: assetKindFor(f.name), size: "—" });
    showToast(files.length === 1 ? `Added ${files[0].name}` : `Added ${files.length} assets`);
  });
}
