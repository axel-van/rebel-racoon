import { html, raw } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=40";
import {
  getContexts,
  subscribe as subscribeContexts,
  duplicateContext,
  deleteContext,
} from "../contexts-store.js?v=24";
import { navigate } from "../router.js?v=21";
import { openRead, startEdit } from "../context-builder.js?v=23";
import { setHandoff } from "../handoff.js?v=20";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=20";
import { renderEmptyState } from "../components/empty-state.js?v=1";

// Contexts library — standalone page (handoff §2.4).
// Header → search → grid of ContextCards. Each card surfaces brand /
// briefSummary / tones / do/don't preview, and an "Edit" button that
// opens the right-panel context-form (read mode by default, edit on demand).

let unsubscribe = null;
let pageState = { query: "" };

export function renderContexts(_params, target) {
  renderTopbar();
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  pageState = { query: "" };
  paint(target);
  unsubscribe = subscribeContexts(() => paint(target));
}

function paint(target) {
  target.innerHTML = html`<section class="screen contexts-view">${raw(renderPage())}</section>`;
  bind(target);
}

function renderPage() {
  const all = getContexts();
  const visible = filter(all, pageState);
  const totalChats = all.reduce((sum, c) => sum + (c.usedIn || 0), 0);

  return html`
    <div class="contexts-view__page">
      <header class="contexts-view__head">
        <div class="contexts-view__head-text">
          <div class="screen__placeholder-eyebrow">Library</div>
          <h1 class="contexts-view__title">Contexts</h1>
          <p class="contexts-view__sub">${all.length} contexts · applied across ${totalChats} chats</p>
        </div>
        <div class="contexts-view__head-actions">
          <div class="ap-input-group contexts-view__search">
            <i class="ap-icon-search"></i>
            <input
              type="search"
              class="ap-input"
              placeholder="Search contexts…"
              value="${escapeAttr(pageState.query)}"
              data-contexts-search
            />
          </div>
          <button type="button" class="ap-button primary orange" data-contexts-new>
            <i class="ap-icon-plus"></i>
            <span>New context</span>
          </button>
        </div>
      </header>

      <div class="contexts-view__body">
        ${visible.length === 0
          ? raw(renderContextsEmpty(all, pageState))
          : raw(`<div class="contexts-view__grid">${visible.map(renderContextCard).join("")}</div>`)}
      </div>
    </div>
  `;
}

// FIND-B4: rich empty state — separates "no contexts at all" (first-run)
// from "search active with no match". Returning user with everything
// deleted hits the same first-run path, which is fine — both want a
// "Create your first context" CTA.
function renderContextsEmpty(allContexts, pageState) {
  const hasQuery = (pageState.query || "").trim().length > 0;
  if (allContexts.length === 0) {
    return renderEmptyState({
      icon: "ap-icon-target",
      title: "No contexts yet",
      body: "Define brand, audience, brief and tone of voice — Archie applies it to every draft.",
      actionHtml: `<button type="button" class="ap-button primary orange" data-contexts-new><i class="ap-icon-plus"></i><span>Create your first context</span></button>`,
      wrapperClass: "contexts-view__empty contexts-view__empty--rich",
    });
  }
  if (hasQuery) {
    return renderEmptyState({
      icon: "ap-icon-search",
      title: "No contexts match",
      body: `No context matches "${escapeText(pageState.query)}". Try a different term.`,
      actionHtml: `<button type="button" class="ap-button stroked grey" data-contexts-clear-query>Clear search</button>`,
      wrapperClass: "contexts-view__empty contexts-view__empty--rich",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-target",
    title: "No contexts to show",
    body: "Create one to get started.",
    wrapperClass: "contexts-view__empty contexts-view__empty--rich",
  });
}

function renderContextCard(ctx) {
  const color = ctx.color || "orange";
  const tones = (ctx.tones || []).slice(0, 3);
  const toneRow = tones.length
    ? `<div class="contexts-card__tones">${tones.map((t) => `<span class="ap-tag">${escapeText(t)}</span>`).join("")}</div>`
    : "";
  const doPreview = (ctx.doRules || []).slice(0, 2);
  const dontPreview = (ctx.dontRules || []).slice(0, 2);
  return `
    <article class="contexts-card contexts-card--${color}" data-contexts-card="${ctx.id}" role="button" tabindex="0">
      <span class="contexts-card__swatch" aria-hidden="true"></span>
      <header class="contexts-card__head">
        <div class="contexts-card__head-text">
          <h3 class="contexts-card__name">${escapeText(ctx.name)}</h3>
          <div class="contexts-card__brand">${escapeText(ctx.brandName || "No brand set")}</div>
        </div>
        <span class="contexts-card__used">${ctx.usedIn || 0} ${(ctx.usedIn || 0) === 1 ? "chat" : "chats"}</span>
      </header>

      ${
        ctx.briefSummary
          ? `<p class="contexts-card__brief">${escapeText(ctx.briefSummary)}</p>`
          : `<p class="contexts-card__brief contexts-card__brief--empty">No brief yet.</p>`
      }

      ${toneRow}

      <div class="contexts-card__lists">
        <div class="contexts-card__list">
          <div class="contexts-card__list-h">Do</div>
          <ul>${doPreview.map((d) => `<li>${escapeText(d)}</li>`).join("") || '<li class="contexts-card__list-empty">—</li>'}</ul>
        </div>
        <div class="contexts-card__list contexts-card__list--dont">
          <div class="contexts-card__list-h">Don't</div>
          <ul>${dontPreview.map((d) => `<li>${escapeText(d)}</li>`).join("") || '<li class="contexts-card__list-empty">—</li>'}</ul>
        </div>
      </div>

      <footer class="contexts-card__foot">
        <button type="button" class="ap-button stroked grey" data-contexts-edit="${ctx.id}">
          <i class="ap-icon-pen"></i>
          <span>Edit</span>
        </button>
        <button type="button" class="ap-icon-button transparent" data-contexts-duplicate="${ctx.id}" title="Duplicate" aria-label="Duplicate">
          <i class="ap-icon-copy"></i>
        </button>
        <button type="button" class="ap-icon-button transparent" data-contexts-delete="${ctx.id}" title="Delete" aria-label="Delete">
          <i class="ap-icon-trash"></i>
        </button>
      </footer>
    </article>
  `;
}

function filter(list, { query }) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.brandName || "").toLowerCase().includes(q) ||
      (c.briefSummary || "").toLowerCase().includes(q),
  );
}

function bind(root) {
  root.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-contexts-edit]");
    if (editBtn) {
      event.stopPropagation();
      startEdit(editBtn.dataset.contextsEdit);
      return;
    }
    if (event.target.closest("[data-contexts-new]")) {
      // The /contexts page has no chat panel to host the wizard, so we
      // spawn a fresh session and arm a handoff so session.js launches
      // contextBuilder.start() on mount. After save, onComplete routes
      // the user back to /contexts (returnTo).
      setHandoff("pendingStartContextBuilder", { returnTo: "/contexts" });
      navigate(`/session/new-ctx-${Date.now().toString(36)}`);
      return;
    }
    if (event.target.closest("[data-contexts-clear-query]")) {
      pageState.query = "";
      paint(root);
      return;
    }
    const dupBtn = event.target.closest("[data-contexts-duplicate]");
    if (dupBtn) {
      event.stopPropagation();
      const copy = duplicateContext(dupBtn.dataset.contextsDuplicate);
      if (copy) {
        import("../components/toast.js?v=20").then(({ showToast }) => showToast("Context duplicated"));
        startEdit(copy.id);
      }
      return;
    }
    const delBtn = event.target.closest("[data-contexts-delete]");
    if (delBtn) {
      event.stopPropagation();
      const ctx = getContexts().find((c) => c.id === delBtn.dataset.contextsDelete);
      if (!ctx) return;
      if (getContexts().length <= 1) {
        import("../components/toast.js?v=20").then(({ showToast }) =>
          showToast("Can't delete the last context — every chat needs one."),
        );
        return;
      }
      // FIND-C1: DS confirm-modal so the delete prompt is keyboard-
      // accessible, themed, and consistent with the rest of the prototype.
      openConfirmModal({
        title: "Delete context?",
        body: `"${ctx.name}" will be removed. Chats currently referencing it will need a new context.`,
        confirmLabel: "Delete",
        cancelLabel: "Keep",
        danger: true,
        onConfirm: () => {
          deleteContext(ctx.id);
          import("../components/toast.js?v=20").then(({ showToast }) => showToast("Context deleted"));
        },
      });
      return;
    }
    // Card click — anywhere outside the action buttons opens the panel in
    // read-only mode for inspection. The footer buttons stop propagation
    // so they win over this fallback.
    const card = event.target.closest("[data-contexts-card]");
    if (card) {
      openRead(card.dataset.contextsCard);
      return;
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-contexts-search]")) {
      pageState.query = event.target.value || "";
      // Repaint the body in place so empty <-> grid transitions both
      // work without losing search input focus.
      const body = root.querySelector(".contexts-view__body");
      if (body) {
        const all = getContexts();
        const visible = filter(all, pageState);
        body.innerHTML =
          visible.length === 0
            ? renderContextsEmpty(all, pageState)
            : `<div class="contexts-view__grid">${visible.map(renderContextCard).join("")}</div>`;
      }
    }
  });
}

function escapeText(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(str) {
  return escapeText(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
