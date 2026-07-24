import { html, raw, escapeText, escapeAttr } from "../utils.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=211";
import {
  getContexts,
  subscribe as subscribeContexts,
  duplicateContext,
  deleteContext,
} from "../contexts-store.js?v=37";
import { navigate } from "../router.js?v=30";
import { setHandoff } from "../handoff.js?v=20";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=22";
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

  // FIND-B: tear down the contexts-store subscription on route change so
  // off-route notifications don't repaint a target that no longer holds
  // this view.
  return () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
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
          <h1 class="contexts-view__title">Playbooks</h1>
          <p class="contexts-view__sub">${all.length} Playbooks · applied across ${totalChats} chats</p>
        </div>
        <div class="contexts-view__head-actions">
          <div class="ap-input-group contexts-view__search">
            <i class="ap-icon-search"></i>
            <input
              type="search"
              class="ap-input"
              placeholder="Search Playbooks…"
              value="${escapeAttr(pageState.query)}"
              data-contexts-search
            />
          </div>
          <button type="button" class="ap-button primary blue" data-contexts-new>
            <i class="ap-icon-plus"></i>
            <span>Create a Playbook</span>
          </button>
        </div>
      </header>

      <div class="contexts-view__body">
        ${visible.length === 0
          ? raw(renderContextsEmpty(all, pageState))
          : raw(
              `<div class="contexts-view__grid">${visible.map(renderContextCard).join("")}${renderGhostCard()}</div>`,
            )}
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
      title: "No Playbooks yet",
      body: "Capture your brand, audience, brief, and tone of voice — I'll apply it to every draft.",
      actionHtml: `<button type="button" class="ap-button primary blue" data-contexts-new><i class="ap-icon-plus"></i><span>Create your first Playbook</span></button>`,
      wrapperClass: "contexts-view__empty contexts-view__empty--rich",
    });
  }
  if (hasQuery) {
    return renderEmptyState({
      icon: "ap-icon-search",
      title: "No Playbooks match",
      body: `No Playbook matches "${escapeText(pageState.query)}". Try a different term.`,
      actionHtml: `<button type="button" class="ap-button stroked grey" data-contexts-clear-query>Clear search</button>`,
      wrapperClass: "contexts-view__empty contexts-view__empty--rich",
    });
  }
  return renderEmptyState({
    icon: "ap-icon-target",
    title: "No Playbooks to show",
    body: "Create one to get started.",
    wrapperClass: "contexts-view__empty contexts-view__empty--rich",
  });
}

// Claude-Projects-style summary card. The card is the primary
// "what is this context" affordance — readable at a glance, with
// secondary actions tucked into a hover-reveal toolbar in the
// top-right corner. DO/DON'T lists and the tones chip row moved
// out: they bloated the card without helping identification, and
// they live in the read panel where they belong.
// Trailing "ghost" card — visually invites a new Playbook from the grid
// itself, so the user doesn't have to chase the header CTA after scrolling.
// Triggers the same `data-contexts-new` handler as the header button.
function renderGhostCard() {
  return `
    <button type="button" class="contexts-card contexts-card--ghost" data-contexts-new aria-label="Create a new Playbook">
      <span class="contexts-card--ghost__glyph"><i class="ap-icon-archie-official"></i></span>
      <span class="contexts-card--ghost__title">Create a Playbook</span>
      <span class="contexts-card--ghost__sub">One brand, one voice, one goal — I'll keep every draft aligned.</span>
    </button>
  `;
}

function renderContextCard(ctx) {
  const color = ctx.color || "orange";
  const summary = (ctx.businessSummary || ctx.briefSummary || "").trim();
  const voiceHeadline =
    ctx.voiceProfile?.headline ||
    (Array.isArray(ctx.tones) && ctx.tones.length ? ctx.tones.join(" · ").toLowerCase() : "");
  const audienceCount = Array.isArray(ctx.audience) ? ctx.audience.length : ctx.audience ? 1 : 0;
  const usedIn = ctx.usedIn || 0;
  // Brand color preview — first website's primary / accent / link from
  // imageVoice, up to 3 dots. Matches the "people avatars" affordance
  // in the Claude reference but uses the analysed brand palette.
  const site = ctx.imageVoice?.websites?.[0];
  const paletteDots = site
    ? [site.colors?.primary, site.colors?.accent, site.colors?.link]
        .filter((c, i, arr) => c && arr.indexOf(c) === i)
        .slice(0, 3)
    : [];
  const dotsHtml = paletteDots.length
    ? `<div class="contexts-card__palette" aria-hidden="true">${paletteDots
        .map((c) => `<span class="contexts-card__palette-dot" style="background:${escapeAttr(c)};"></span>`)
        .join("")}</div>`
    : "";
  const isDefaultBadge = ctx.isDefault
    ? `<span class="contexts-card__badge" title="Default Playbook"><i class="ap-icon-star_fill"></i></span>`
    : "";
  return `
    <article class="contexts-card contexts-card--${color}" data-contexts-card="${ctx.id}" role="button" tabindex="0">
      <span class="contexts-card__swatch" aria-hidden="true"></span>

      <div class="contexts-card__actions" data-contexts-card-actions>
        <button type="button" class="ap-icon-button transparent" data-contexts-edit="${ctx.id}" title="Edit" aria-label="Edit">
          <i class="ap-icon-pen"></i>
        </button>
        <button type="button" class="ap-icon-button transparent" data-contexts-duplicate="${ctx.id}" title="Duplicate" aria-label="Duplicate">
          <i class="ap-icon-copy"></i>
        </button>
        <button type="button" class="ap-icon-button transparent" data-contexts-delete="${ctx.id}" title="Delete" aria-label="Delete">
          <i class="ap-icon-trash"></i>
        </button>
      </div>

      <header class="contexts-card__head">
        <h3 class="contexts-card__name">
          ${escapeText(ctx.name)}
          ${isDefaultBadge}
        </h3>
      </header>

      ${
        voiceHeadline
          ? `<div class="contexts-card__voice">
              <i class="ap-icon-archie-official"></i>
              <span>${escapeText(voiceHeadline)}</span>
            </div>`
          : ""
      }

      ${
        summary
          ? `<p class="contexts-card__brief">${escapeText(summary)}</p>`
          : `<p class="contexts-card__brief contexts-card__brief--empty">No brief yet — open this Playbook to add one.</p>`
      }

      <footer class="contexts-card__foot">
        <div class="contexts-card__counters">
          <span class="contexts-card__counter" title="${usedIn} ${usedIn === 1 ? "chat uses this Playbook" : "chats use this Playbook"}">
            <i class="ap-icon-single-chat-bubble"></i>
            <span>${usedIn}</span>
          </span>
          ${
            audienceCount
              ? `<span class="contexts-card__counter" title="${audienceCount} ${audienceCount === 1 ? "audience" : "audiences"}">
                  <i class="ap-icon-target"></i>
                  <span>${audienceCount}</span>
                </span>`
              : ""
          }
        </div>
        ${dotsHtml}
      </footer>

      <div class="contexts-card__updated">Updated ${escapeText(ctx.updatedAt || "recently")}</div>
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
    // Edit (pen icon) — opens the Playbook detail page, where the brief
    // panel handles in-place edits (rename, toggle chips, change brand
    // color, etc.).
    const editBtn = event.target.closest("[data-contexts-edit]");
    if (editBtn) {
      event.stopPropagation();
      navigate(`/playbook/${editBtn.dataset.contextsEdit}`);
      return;
    }
    if (event.target.closest("[data-contexts-new]")) {
      // Launch the conversational Playbook flow (welcome-alt) integrated in
      // the app shell: the `welcomeAltIntegrated` flag keeps the sidebar +
      // topbar visible and the recap finishes by returning here (no
      // switch-to-returning). A `welcome-alt-` session id gets the flow + hero.
      try {
        window.sessionStorage.setItem("welcomeAltIntegrated", "1");
        window.sessionStorage.setItem("welcomeAltReturnTo", "/contexts");
      } catch {
        /* ignore */
      }
      setHandoff("pendingStartContextBuilder", { flow: "alt", prefilledUrl: "", returnTo: "/contexts" });
      navigate(`/session/welcome-alt-${Date.now().toString(36)}`);
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
        import("../components/toast.js?v=20").then(({ showToast }) => showToast("Playbook duplicated"));
        navigate(`/playbook/${copy.id}`);
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
          showToast("Can't delete the last Playbook — every chat needs one."),
        );
        return;
      }
      // FIND-C1: DS confirm-modal so the delete prompt is keyboard-
      // accessible, themed, and consistent with the rest of the prototype.
      openConfirmModal({
        title: "Delete Playbook?",
        body: `"${ctx.name}" will be removed. Chats using it will need a new Playbook.`,
        confirmLabel: "Delete Playbook",
        cancelLabel: "Keep",
        danger: true,
        onConfirm: () => {
          deleteContext(ctx.id);
          import("../components/toast.js?v=20").then(({ showToast }) => showToast("Playbook deleted"));
        },
      });
      return;
    }
    // Card click — anywhere outside the action buttons opens the panel in
    // read-only mode for inspection. The footer buttons stop propagation
    // so they win over this fallback.
    const card = event.target.closest("[data-contexts-card]");
    if (card) {
      navigate(`/playbook/${card.dataset.contextsCard}`);
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
