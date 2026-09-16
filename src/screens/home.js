import { html, raw, escapeText, escapeAttr } from "../utils.js?v=1224";
import { renderTopbar } from "../components/topbar.js?v=1224";
import {
  getContexts,
  getContextById,
  subscribe as subscribeContexts,
  duplicateContext,
  deleteContext,
} from "../contexts-store.js?v=1224";
import { getSessions, getSessionById, subscribe as subscribeSessions } from "../sessions-store.js?v=1224";
import { getSources, getIdeas } from "../library.js?v=1224";
import { getPosts } from "../posts-store.js?v=1224";
import { parseHashParams, setHashQuery } from "../url-state.js?v=1224";
import { closePanel as closeRightPanel } from "../components/right-panel.js?v=1224";
import { navigate, getPath } from "../router.js?v=1224";
import { setHandoff } from "../handoff.js?v=1224";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=1224";
import { renderEmptyState } from "../components/empty-state.js?v=1224";
import {
  visibleContexts,
  usableContexts,
  canView,
  canEdit,
  canDelete,
  canManageSharing,
  accessLabel,
  isMine,
} from "../playbook-access.js?v=1224";
import { isWorkspaceMode, getActivePlaybookId, setActivePlaybook, catalogueRoute } from "../active-playbook.js?v=1224";
import { open as openShareModal } from "../components/share-playbook-modal.js?v=1224";
import { installMoreMenu } from "../components/more-menu.js?v=1224";
import { renderStarterCards } from "../components/starter-card.js?v=1224";
import { isFlagOn } from "../feature-flags.js?v=1224";
import { getConnectedConnectors } from "../connectors-store.js?v=1224";
import { renderConnectorLogo } from "../connectors-view.js?v=1224";
import { ownerOf } from "../playbook-access.js?v=1224";

// The account HOME — and the Playbooks catalogue it merged with.
//
// ── Two levels, two homes ─────────────────────────────────────────────────
// `/` is the home of the active BRAND: a pure redirect to its most recent chat
// (dashboard.js). This is the home of the ACCOUNT — the level above the
// workspaces, where the two things that exist at that level live: the catalogue
// of brands, and every chat, all brands. A hero on top turns it from a place
// that only manages into a place you start from: type, pick a Playbook, Enter.
//
// ⚠️ NOT the front page that was deleted. `frontPage` made `/` a magazine fed by
// listening, and that arbitration is closed (CLAUDE.md § The Topic Feed). The
// test that separates them: the front page was a page of what Archie PROPOSES;
// this is a page of what you HAVE. No Topic, no topics-store read, and `/` is
// untouched.
//
// ── Two routes, one module ────────────────────────────────────────────────
//   /home      → renderHome          the hero + the two tabs   (workspace mode)
//   /contexts  → renderContextsRoute the catalogue on its own   (flag OFF)
// Each gates itself and bounces, the way /topics and /insights do, so a stale
// deep link lands somewhere real instead of rendering a dead screen. The
// catalogue path is byte-for-byte what it was: flag OFF, nothing here changed.
//
// ⚠️ The names still say `contexts` — the classes (`.contexts-view__*`,
// `.contexts-card*`) and the stylesheet (styles/screens/contexts.css). Renaming
// them would touch a stylesheet and every card selector for something no user
// can see; same call as the `.isv2-` prefix in the Image Studio.

// ── The row's overflow menu — one open at a time (shared behaviour) ───────
// The row lists its verbs in a kebab instead of the tile's hover toolbar. Two
// reasons: a toolbar whose width depends on my rights (four buttons or two)
// makes the whole right-hand cluster start at a different x on every row, which
// is the one thing a list is for; and a hover-only control is a poor primary on
// a row whose body is now a navigation. Installed once at module scope, like
// source-card and idea-card do — it binds document listeners.
installMoreMenu({
  menuSelector: ".home-playbooks__more-menu",
  triggerSelector: "[data-playbook-more]",
  closeAfterSelectors: [
    "[data-contexts-share]",
    "[data-contexts-edit]",
    "[data-contexts-duplicate]",
    "[data-contexts-delete]",
  ],
});

let unsubs = [];
// Where this screen paints — the router's #app. Held at module level because
// every repaint path (a store notify, Clear search, a tab switch) has to reach
// it, and bind() is handed the SECTION, not this.
let mountTarget = null;
let pageState = { query: "", pickedPlaybookId: null };
// Which of the two surfaces this mount is. Module-level rather than threaded
// through every renderer: the search's partial repaint needs it too.
let isHome = false;

export function renderHome(_params, target) {
  // No level above the work without the workspace model — so no home either.
  if (!isWorkspaceMode()) {
    replaceHash("/");
    return;
  }
  return mountScreen(target, true);
}

export function renderContextsRoute(_params, target) {
  // In workspace mode the catalogue IS the home's Playbooks tab. Kept as a
  // route so every stale deep link and every inbound navigate still lands — on
  // that TAB, since `/contexts` meant the catalogue and the home opens on Chats.
  if (isWorkspaceMode()) {
    replaceHash(catalogueRoute());
    return;
  }
  return mountScreen(target, false);
}

// `replace`, not navigate(): a redirect that writes a history entry gives the
// reader a Back button that lands on the route it just left and bounces again —
// a Back that does nothing. Same call dashboard.js makes for the same reason.
function replaceHash(path) {
  window.location.replace(window.location.href.split("#")[0] + "#" + path);
}

function mountScreen(target, home) {
  isHome = home;
  mountTarget = target;
  renderTopbar();
  drainSubs();
  paint();
  // FIND-B: tear the subscriptions down on route change so off-route
  // notifications don't repaint a target that no longer holds this view.
  unsubs.push(subscribeContexts(() => paint()));
  // The Chats tab has to move when a chat is renamed, pinned or deleted
  // somewhere else — the rail's ⋮ menu, mostly.
  if (home) unsubs.push(subscribeSessions(() => paint()));
  return () => {
    drainSubs();
    // Switching tab is a query-only change, which re-runs this handler: the
    // path is already the NEW one here, so a tab switch keeps the search box
    // and leaving the surface forgets it.
    if (getPath() !== "/home") pageState = { query: "", pickedPlaybookId: null };
  };
}

function drainSubs() {
  unsubs.forEach((off) => off());
  unsubs = [];
}

function paint() {
  const target = mountTarget;
  if (!target) return;
  target.innerHTML = html`<section class="screen contexts-view" data-home-root>${raw(renderPage())}</section>`;
  // ⚠️ Bind to the SECTION, not to `target`. `target` is #app, which paint()
  // never replaces — so every repaint (a store notify, Clear search) stacked
  // another pair of listeners on it, and after two paints one click on the
  // ghost card minted two sessions. The section's innerHTML IS replaced, so
  // its listeners die with the node. `querySelector` rather than
  // firstElementChild: the html`` template can leave a leading text node.
  bind(target.querySelector("[data-home-root]"));
}

// Which list the home is showing. In the URL, like every other screen state
// here (`?tab=` on a session, `?pb=` on the feed): the two lists are then
// linkable and the browser's Back moves between them. An unknown value falls
// back rather than rendering nothing.
function activeTab() {
  // Chats first, and the default: the home's subject is the work, and the
  // catalogue is what you open to switch, create or manage. An unknown value
  // falls back rather than rendering nothing.
  return parseHashParams().get("tab") === "playbooks" ? "playbooks" : "chats";
}

function renderPage() {
  // What I'm allowed to see, not what the store holds — a colleague's private
  // Playbook is in the store and must not be in this grid.
  const all = visibleContexts();
  const totalChats = all.reduce((sum, c) => sum + (c.usedIn || 0), 0);

  // Flag OFF — the catalogue on its own, header and all, exactly as before.
  if (!isHome) {
    return html`
      <div class="contexts-view__page">
        <header class="contexts-view__head">
          <div class="contexts-view__head-text">
            <h1 class="contexts-view__title">Playbooks</h1>
            <p class="contexts-view__sub">${all.length} Playbooks · applied across ${totalChats} chats</p>
          </div>
          <div class="contexts-view__head-actions">${raw(renderSearchField())}${raw(renderCreateButton())}</div>
        </header>

        <div class="contexts-view__body">${raw(renderTabBody())}</div>
      </div>
    `;
  }

  // The home. No `h1 Playbooks` and no count sub-line up here: the hero owns
  // the page's only h1, and a heading reading "Playbooks" forty pixels under a
  // tab reading "Playbooks 8" is the same word twice with the same number
  // beside it. What the sub-line said that the tab doesn't survives in the
  // toolbar under it.
  const tab = activeTab();
  return html`
    <div class="contexts-view__page">
      ${raw(renderHomeHero())} ${raw(renderHomeWorkflows())}
      ${raw(renderHomeTabs(all.length, getSessions().length, tab))} ${raw(renderHomeToolbar(tab, totalChats))}
      <div class="contexts-view__body">${raw(renderTabBody())}</div>
    </div>
  `;
}

// ⚠️ ONE body renderer, two callers: renderPage() and the search's `input`
// handler, which repaints only this so the field keeps its caret. They were two
// copies and they had drifted twice — the partial one read getContexts() where
// the page reads visibleContexts() (so typing surfaced a colleague's private
// Playbook) and it forgot the ghost card (which vanished on the first
// keystroke). Two callers, one function: they cannot drift again.
function renderTabBody() {
  if (isHome && activeTab() === "chats") return renderChatsTab();
  const all = visibleContexts();
  const visible = filter(all, pageState);
  if (visible.length === 0) return renderContextsEmpty(all, pageState);
  // On the home the Playbooks tab is a LIST of full-width rows, not a grid of
  // tiles. Two reasons, and the second is the one that matters: the numbers
  // (chats, audiences, competitors) line up in a column you can read down —
  // a 3-up grid scatters them across nine positions — and a row is the shape
  // of the thing it now is, a door into a workspace, sitting beside the Chats
  // tab's own rows. Flag OFF the catalogue keeps its grid: it is a page for
  // browsing fiches, and its cards are the object, not a door.
  if (isHome) return renderPlaybooksTable(visible);
  return `<div class="contexts-view__grid">${visible.map(renderContextCard).join("")}${renderGhostCard()}</div>`;
}

function renderSearchField() {
  const chats = isHome && activeTab() === "chats";
  return `
    <div class="ap-input-group contexts-view__search">
      <i class="ap-icon-search"></i>
      <input
        type="search"
        class="ap-input"
        placeholder="${chats ? "Search chats…" : "Search Playbooks…"}"
        value="${escapeAttr(pageState.query)}"
        data-contexts-search
      />
    </div>
  `;
}

function renderCreateButton() {
  return `
    <button type="button" class="ap-button primary blue" data-contexts-new>
      <i class="ap-icon-plus"></i>
      <span>Create a Playbook</span>
    </button>
  `;
}

// ── The hero — the reason this page exists ────────────────────────────────
//
// Type, pick the brand, Enter. It is the one thing the catalogue could not do:
// manage, yes; start, no.
//
// ⚠️ NOT `.empty-chat`, which is the chat's own hero: `.app-shell:has(.empty-chat)`
// in layout.css HIDES the app topbar, and here the topbar carries the only way
// back into the work. Its own classes, its own stylesheet.
//
// No wordmark either — this page is reached by clicking the wordmark, and
// printing it again is the click's own echo.
function renderHomeHero() {
  const options = usableContexts();
  // Nothing to pick from → no hero. A dead composer over an empty picker is
  // exactly the "greyed-out field the reader has to rule out" that the six
  // in-flow pickers were deleted for. The Playbooks tab's own empty state
  // already carries the one useful move, and it should say it once.
  if (options.length === 0) return "";
  const picked = pickedPlaybook();
  return `
    <section class="home-hero">
      <h1 class="home-hero__title">What are we working on?</h1>
      <p class="home-hero__sub">Pick a Playbook, tell me what you need, and I'll open a chat on it.</p>

      <div class="home-hero__card">
        <textarea
          class="home-hero__input"
          rows="3"
          placeholder="Tell me what you need…"
          aria-label="Tell me what you need"
          data-home-prompt
        ></textarea>
        <div class="home-hero__toolbar">
          ${renderHomeAdd()} ${renderHeroPicker(picked, options)}
          <button
            type="button"
            class="ap-button primary orange home-hero__send"
            data-home-send
            aria-label="Send"
            title="Send"
            disabled
          >
            <i class="ap-icon-arrow-up"></i>
          </button>
        </div>
      </div>
    </section>
  `;
}

// The brand this chat will run on. `usableContexts()`, not visibleContexts():
// a fiche you may read is not necessarily one you may write under.
function pickedPlaybook() {
  const options = usableContexts();
  const wanted = pageState.pickedPlaybookId;
  return (
    (wanted && options.find((c) => c.id === wanted)) ||
    options.find((c) => c.id === getActivePlaybookId()) ||
    options[0] ||
    null
  );
}

// ── The hero's Add menu ───────────────────────────────────────────────────
//
// The same offer the chat composer makes — a PDF, a video, a URL, pasted text,
// your top posts, a Topic, a connected source. It cannot DO any of it here: the
// intake machinery is per-session (uploads, processing, replay), and there is no
// session on this page.
//
// So the home doesn't stage, it LAUNCHES: picking an item switches to the
// chosen brand, mints the chat, and hands the intent across in
// `pendingHomeAdd`, which session.js dispatches to the very same functions the
// composer's own menu calls. One key, one switch — three keys for three flows
// would be three rows in the handoff table that all mean "the home asked".
//
// FLAT, with dividers: the ADS ships no nested dropdown, so the composer's
// "Connected sources ▸" flyout is not reproduced — the connected sources are a
// third section instead.
function renderHomeAdd() {
  const item = (hook, icon, label) => `
    <button type="button" role="menuitem" class="ap-action-dropdown-item" ${hook}>
      <i class="${icon}"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${label}</span>
        </div>
      </div>
    </button>
  `;
  const divider = `<div class="ap-action-dropdown-divider" role="separator"></div>`;

  const topics = isFlagOn("topicFeed")
    ? item('data-home-add="topic"', "ap-icon-antenna", "Pick from the Topic Feed")
    : "";

  let connectors = "";
  if (isFlagOn("connectors")) {
    const connected = getConnectedConnectors();
    const rows = connected.length
      ? connected
          .map(
            (c) => `
            <button type="button" role="menuitem" class="ap-action-dropdown-item home-hero__connector" data-home-add-connector="${escapeAttr(c.id)}">
              <span class="home-hero__connector-logo">${renderConnectorLogo(c, 18)}</span>
              <div class="ap-action-dropdown-item-text">
                <div class="ap-action-dropdown-item-label-container">
                  <span class="ap-action-dropdown-item-label">${escapeText(c.name)}</span>
                </div>
              </div>
            </button>`,
          )
          .join("")
      : `<div class="home-hero__menu-label">No sources connected yet</div>`;
    connectors = `
      ${divider}
      <div class="home-hero__menu-label">Connected sources</div>
      ${rows}
      ${item('data-home-add="connectors"', "ap-icon-view-grid", "Browse connectors")}
    `;
  }

  return `
    <div class="home-hero__add">
      <button
        type="button"
        class="ap-button stroked grey"
        data-home-add-toggle
        aria-haspopup="menu"
        aria-expanded="false"
      >
        <i class="ap-icon-plus"></i>
        <span>Add</span>
      </button>
      <div class="ap-action-dropdown home-hero__add-menu" data-home-add-menu role="menu" hidden>
        ${item('data-home-add="pdf"', "ap-icon-file--pdf", "Add PDF")}
        ${item('data-home-add="video"', "ap-icon-file--video", "Add video")}
        ${item('data-home-add="url"', "ap-icon-link", "Add URL")}
        ${item('data-home-add="text"', "ap-icon-file--text", "Paste text")}
        ${divider}
        ${item('data-home-add="top-posts"', "ap-icon-feature-analytics", "Top performing posts")}
        ${topics}
        ${connectors}
      </div>
    </div>
  `;
}

// Same DS select as the rail's switcher, deliberately: it is the same question
// about the same object, so it should be the same control. Minus the footer —
// "All playbooks" IS this page, and the surface already carries two doors to
// creating one (the toolbar button and the grid's ghost card).
function renderHeroPicker(picked, options) {
  const rows = options
    .map((c) => {
      const on = picked && c.id === picked.id;
      return `
        <div
          class="ap-select-option${on ? " selected" : ""}"
          data-home-pb-pick="${escapeAttr(c.id)}"
          role="option"
          aria-selected="${on ? "true" : "false"}"
        >
          <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${escapeAttr(c.color || "grey")}" aria-hidden="true"></span>
          <span class="ap-select-option-text">${escapeText(c.name)}</span>
          ${on ? `<i class="ap-icon-check ap-select-option-check" aria-hidden="true"></i>` : ""}
        </div>
      `;
    })
    .join("");
  return `
    <details class="ap-select home-hero__pb" data-home-pb>
      <summary class="ap-select-trigger" title="Playbook: ${escapeAttr(picked?.name || "")} — the brand this chat runs on">
        <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${escapeAttr(picked?.color || "grey")}" aria-hidden="true"></span>
        <span class="ap-select-inline-label">Playbook</span>
        <span class="ap-select-value">${escapeText(picked?.name || "Select a Playbook")}</span>
        <i class="ap-icon-chevron-down ap-select-arrow" aria-hidden="true"></i>
      </summary>
      <div class="ap-select-dropdown" role="listbox" aria-label="Choose a Playbook">
        <div class="ap-select-options">${rows}</div>
      </div>
    </details>
  `;
}

// ── The three workflows ───────────────────────────────────────────────────
//
// The same cards the new chat's hero carries, from the same renderer
// (components/starter-card.js). They belong here for the reason the hero has
// them: the composer answers "I know what I want to say", these answer "I have
// a source / a video / a winning post and want a batch out of it" — and on the
// home you also get to say WHICH brand it lands in before it starts.
//
// Only the dispatch differs: the chat runs the flow in place, the home switches
// brand and mints the session the flow needs (see startFromStarter).
//
// Full page width, unlike the hero's 720px column: the cards then share their
// left and right edges with the list under them, so the page reads as one
// centred prompt over two full-width blocks rather than three widths stacked.
function renderHomeWorkflows() {
  // Nothing to start a workflow IN yet. Same rule as the hero.
  if (usableContexts().length === 0) return "";
  return `
    <section class="home-workflows">
      <h2 class="home-workflows__label" id="homeStarterLabel">Jump into a workflow</h2>
      <div class="starter-grid" role="group" aria-labelledby="homeStarterLabel">${renderStarterCards()}</div>
    </section>
  `;
}

// ── The two lists ─────────────────────────────────────────────────────────
// Real DS tabs (.ap-tabs ships in ds/css-ui). /topics dropped its tabs because
// only one list was ever on screen there; here there are genuinely two, which
// is the case the component is for. Counters are safe on both: each counts
// THINGS, so "Chats 12" reads as twelve chats.
function renderHomeTabs(playbookCount, chatCount, tab) {
  const item = (id, icon, label, count) => {
    const on = tab === id;
    return `
      <button
        type="button"
        class="ap-tabs-tab${on ? " active" : ""}"
        role="tab"
        aria-selected="${on ? "true" : "false"}"
        data-home-tab="${id}"
      >
        <i class="${icon}" aria-hidden="true"></i>
        <span>${label}</span>
        <span class="ap-counter normal ${on ? "blue" : "grey"}">${count}</span>
      </button>
    `;
  };
  return `
    <div class="ap-tabs">
      <div class="ap-tabs-nav" role="tablist" aria-label="Playbooks and chats">
        ${item("chats", "ap-icon-single-chat-bubble", "Chats", chatCount)}
        ${item("playbooks", "ap-icon-target", "Playbooks", playbookCount)}
      </div>
    </div>
  `;
}

// Under the tabs rather than beside them: the DS nav owns its full-width rule,
// and hanging a search field inside a [role=tablist] would put a non-tab in it.
function renderHomeToolbar(tab, totalChats) {
  const hint =
    tab === "playbooks"
      ? `<p class="home-toolbar__hint muted">Applied across ${totalChats} chats</p>`
      : `<p class="home-toolbar__hint muted">Every chat, every Playbook.</p>`;
  return `
    <div class="home-toolbar">
      ${hint}
      <div class="home-toolbar__actions">
        ${renderSearchField()}
        ${tab === "playbooks" ? renderCreateButton() : ""}
      </div>
    </div>
  `;
}

// The Playbooks tab — a TABLE, the same shape as the Chats tab beside it.
//
// ⚠️ It was a list of horizontal cards for two commits, and before that a grid
// of tiles. The table is the end of that road, and the reason is what these two
// tabs ARE: records to scan. Short comparable fields, one row each, and a
// reader moving DOWN a column — which is what a table is, and what the card
// list was imitating with fixed widths, one uniform row height and aligned
// numbers. Only the border and radius per row were still card.
//
// What the table adds that no card list could: its columns are NAMED, in text,
// in a header. The card list left the reader to infer that "MB" was an owner, a
// pen was a permission and a date was the last edit.
//
// The grid of tiles survives for `/contexts` flag OFF: there, a Playbook is an
// object you browse, not a row you pick from.
function renderPlaybooksTable(list) {
  if (!list.length) return renderContextsEmpty(visibleContexts(), pageState);
  const sharing = isFlagOn("playbookSharing");
  return `
    <table class="ap-table outer-border header-background clickable-rows home-playbooks">
      <thead>
        <tr>
          <th scope="col">Playbook</th>
          ${sharing ? `<th scope="col">Owner</th><th scope="col">Access</th>` : ""}
          <th scope="col">Updated</th>
          <th scope="col" class="right">Action</th>
        </tr>
      </thead>
      <tbody>${list.map(renderPlaybookRow).join("")}</tbody>
    </table>
  `;
}

// One Playbook, as a row. The words it says — the brief, the default star, the
// Current mark — come from the same three helpers the tile uses, so the two
// shapes can't drift into saying different things about one Playbook.
function renderPlaybookRow(ctx) {
  const sharing = isFlagOn("playbookSharing");
  const owner = sharing ? ownerOf(ctx) : null;
  const mine = isMine(ctx);
  const accessTitle = accessLabel(ctx) || (canEdit(ctx) ? "You can edit this Playbook" : "Read-only");
  const title = startChatTitle(ctx);
  return `
    <tr
      data-contexts-card="${escapeAttr(ctx.id)}"
      role="button"
      tabindex="0"
      ${title ? `title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}"` : ""}
    >
      <td>
        <div class="ap-table-cell-content home-playbooks__identity">
          ${playbookThumb(ctx)}
          <div class="home-playbooks__text">
            <div class="home-playbooks__name-row">
              <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${escapeAttr(ctx.color || "grey")}" aria-hidden="true"></span>
              <span class="home-playbooks__name">${escapeText(ctx.name)}</span>
              ${defaultBadge(ctx)}${currentTagFor(ctx)}
            </div>
            <div class="home-playbooks__brief">${escapeText(playbookBrief(ctx))}</div>
          </div>
        </div>
      </td>
      ${
        sharing
          ? `<td>
              <div class="ap-table-cell-content home-playbooks__owner">
                <span class="ap-avatar size-24"><span class="ap-avatar-initials">${escapeText(mine ? "MB" : owner?.initials || "?")}</span></span>
                <span class="home-playbooks__owner-name">${escapeText(mine ? "You" : owner?.name || "a teammate")}</span>
              </div>
            </td>
            <td>
              <div class="ap-table-cell-content home-playbooks__access" title="${escapeAttr(accessTitle)}" aria-label="${escapeAttr(accessTitle)}">
                <i class="${canEdit(ctx) ? "ap-icon-pen" : "ap-icon-eye-on"}" aria-hidden="true"></i>
              </div>
            </td>`
          : ""
      }
      <td><div class="ap-table-cell-content">${escapeText(ctx.updatedAt || "recently")}</div></td>
      <td class="right">${playbookMoreMenu(ctx)}</td>
    </tr>
  `;
}

// ── The three pieces both shapes must say the same way ───────────────────

// The brand's own mark where the analysis found a logo, its initials where it
// didn't — so the column keeps one width and one shape, and never a stretched
// or cropped lockup.
function playbookThumb(ctx) {
  const initials = String(ctx.name || "")
    .split("·")[0]
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return `
    <span class="ap-avatar square size-32 home-playbooks__thumb" aria-hidden="true">
      ${
        ctx.brandLogo
          ? `<img src="${escapeAttr(ctx.brandLogo)}" alt="" />`
          : `<span class="ap-avatar-initials">${escapeText(initials)}</span>`
      }
    </span>
  `;
}

function playbookBrief(ctx) {
  const summary = (ctx.businessSummary || ctx.briefSummary || "").trim();
  return summary || "No brief yet — open this Playbook to add one.";
}

function defaultBadge(ctx) {
  return ctx.isDefault
    ? `<span class="contexts-card__badge" title="Default Playbook"><i class="ap-icon-star_fill"></i></span>`
    : "";
}

// What activating this Playbook does, as a title — empty without the workspace
// model, where a card opens the fiche instead.
function startChatTitle(ctx) {
  return isWorkspaceMode() ? `Start a chat in ${ctx.name}` : "";
}

function currentTagFor(ctx) {
  return isWorkspaceMode() && ctx.id === getActivePlaybookId()
    ? `<span class="ap-tag blue mini contexts-card__current"><span>Current</span></span>`
    : "";
}

// The four verbs, in a DS action-dropdown. Same `data-contexts-*` hooks as the
// tile's hover toolbar, so the screen's handlers don't know which shape fired.
function playbookMoreMenu(ctx) {
  const menuId = `ctxMore-${ctx.id}`;
  const item = (hook, icon, label, danger) => `
    <button
      type="button"
      role="menuitem"
      class="ap-action-dropdown-item${danger ? " red-mode" : ""}"
      ${hook}="${escapeAttr(ctx.id)}"
    >
      <i class="${icon}"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${label}</span>
        </div>
      </div>
    </button>
  `;
  return `
    <div class="home-playbooks__more">
      <button
        type="button"
        class="ap-icon-button transparent"
        data-playbook-more="${escapeAttr(ctx.id)}"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-controls="${menuId}"
        aria-label="More actions"
        title="More actions"
      >
        <i class="ap-icon-more"></i>
      </button>
      <div class="ap-action-dropdown home-playbooks__more-menu" id="${menuId}" role="menu" hidden>
        ${canManageSharing(ctx) ? item("data-contexts-share", "ap-icon-share", "Share") : ""}
        ${canEdit(ctx) ? item("data-contexts-edit", "ap-icon-pen", "Open the Playbook") : ""}
        ${item("data-contexts-duplicate", "ap-icon-copy", "Duplicate")}
        ${canDelete(ctx) ? item("data-contexts-delete", "ap-icon-trash", "Delete", true) : ""}
      </div>
    </div>
  `;
}

// The Chats tab — `getSessions()`, UNSCOPED. That is the whole point of the
// tab: at the account level the question is "where is my work", and the rail
// one level down already answers "this brand's work".
//
// .ap-table rather than .ap-list-panel: the latter is a master-detail left
// column (border-right, height 100%) with no column structure, and this needs
// three aligned columns.
function renderChatsTab() {
  const q = (pageState.query || "").trim().toLowerCase();
  // Recency, the store's own order, and nothing else. NOT pinned-first, which
  // this list led with for a commit: a pin is something you do to a chat inside
  // its workspace, so the rail is where it sorts and where it shows. Up here the
  // only visible ordering column is Last activity, and a list ordered by a fact
  // it doesn't print reads as arbitrary.
  const rows = getSessions()
    .map((s) => ({ session: s, ctx: chatPlaybook(s) }))
    .filter(({ session, ctx }) => {
      if (!q) return true;
      // The brand is a visible column, so it has to be searchable.
      return `${session.name} ${ctx?.name || ""}`.toLowerCase().includes(q);
    });

  if (rows.length === 0) {
    return q
      ? renderEmptyState({
          icon: "ap-icon-search",
          title: "No chats match",
          body: `No chat matches "${escapeText(pageState.query)}". Try a different term.`,
          actionHtml: `<button type="button" class="ap-button stroked grey" data-contexts-clear-query>Clear search</button>`,
          wrapperClass: "contexts-view__empty contexts-view__empty--rich",
          level: 2,
        })
      : renderEmptyState({
          icon: "ap-icon-single-chat-bubble",
          title: "No chats yet",
          body: "Start one from the box above — pick a Playbook and tell me what you need.",
          wrapperClass: "contexts-view__empty contexts-view__empty--rich",
          level: 2,
        });
  }

  const body = rows
    .map(
      ({ session, ctx }) => `
      <tr data-home-chat="${escapeAttr(session.id)}" role="button" tabindex="0">
        <td>
          <div class="ap-table-cell-content">
            <span class="home-chats__name">${escapeText(session.name)}</span>
          </div>
        </td>
        ${countCell(getSources(session.id).length)}
        ${countCell(getIdeas(session.id).length)}
        ${countCell(getPosts(session.id).length)}
        <td>
          <div class="ap-table-cell-content">
            <span class="app-sidebar__row-color-dot app-sidebar__row-color-dot--${escapeAttr(ctx?.color || "grey")}" aria-hidden="true"></span>
            <span class="${ctx ? "" : "muted"}">${ctx ? escapeText(ctx.name) : "No Playbook"}</span>
          </div>
        </td>
        <td><div class="ap-table-cell-content">${escapeText(session.lastActivity || "")}</div></td>
      </tr>
    `,
    )
    .join("");

  return `
    <table class="ap-table small outer-border header-background clickable-rows home-chats">
      <thead>
        <tr>
          <th scope="col">Chat</th>
          <th scope="col" class="right">Sources</th>
          <th scope="col" class="right">Ideas</th>
          <th scope="col" class="right">Drafts</th>
          <th scope="col">Playbook</th>
          <th scope="col">Last activity</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

// How far the work in a chat got — sources in, ideas out, drafts written. Three
// numbers with a COLUMN HEADER each rather than three icons in one cell: a
// number needs its name in text, and in a table the header is that name.
//
// ⚠️ Not the same call as the Playbooks tab, which just LOST its three counters.
// The difference is what the reader is doing: nobody picks a brand by how many
// audiences its fiche lists, but "3 sources · 5 ideas · 2 drafts" is exactly how
// far a conversation got, which is what you scan a list of work for.
//
// A zero prints as a zero, muted: an empty cell in a numeric column reads as
// "unknown", and "this chat has produced nothing yet" is a fact worth seeing.
function countCell(n) {
  return `<td class="right"><div class="ap-table-cell-content">
    <span class="${n ? "home-chats__count" : "home-chats__count home-chats__count--zero"}">${n}</span>
  </div></td>`;
}

// The Playbook behind a chat, but only if I may open it — same rule the rail's
// rows follow: a chat that lost access shows the grey dot and the neutral word,
// never a name it can't reach.
function chatPlaybook(session) {
  if (!session?.contextId) return null;
  const ctx = getContextById(session.contextId);
  return ctx && canView(ctx) ? ctx : null;
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
  // `suggested` entries are still pending proposals from Archie, not
  // competitors of this brand yet — they must not inflate the count.
  const competitorCount = Array.isArray(ctx.competitors) ? ctx.competitors.filter((c) => !c.suggested).length : 0;
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
  const isDefaultBadge = defaultBadge(ctx);
  // Who this Playbook belongs to, in the card's metadata corner next to the
  // palette dots — never a coloured border, a card's state goes in its content.
  // It tried living beside the title first and broke long names onto two lines;
  // the foot is also where the Claude reference puts its people avatars.
  // Mine-and-private says nothing, because that's the default nobody needs told.
  const access = accessLabel(ctx);
  const ownerTag = access
    ? `<span class="ap-tag grey mini contexts-card__owner" title="${escapeAttr(access)}">
        <i class="${isMine(ctx) ? "ap-icon-multiple-users" : "ap-icon-user"}" aria-hidden="true"></i>
        <span>${escapeText(access)}</span>
      </span>`
    : "";
  // Only the actions I can actually take. For a Playbook someone shared with
  // me that's Duplicate alone — the one move that turns reading into having.
  const actions = [
    canManageSharing(ctx)
      ? `<button type="button" class="ap-icon-button transparent" data-contexts-share="${ctx.id}" title="Share" aria-label="Share">
          <i class="ap-icon-share"></i>
        </button>`
      : "",
    canEdit(ctx)
      ? `<button type="button" class="ap-icon-button transparent" data-contexts-edit="${ctx.id}" title="Edit" aria-label="Edit">
          <i class="ap-icon-pen"></i>
        </button>`
      : "",
    `<button type="button" class="ap-icon-button transparent" data-contexts-duplicate="${ctx.id}" title="Duplicate" aria-label="Duplicate">
      <i class="ap-icon-copy"></i>
    </button>`,
    canDelete(ctx)
      ? `<button type="button" class="ap-icon-button transparent" data-contexts-delete="${ctx.id}" title="Delete" aria-label="Delete">
          <i class="ap-icon-trash"></i>
        </button>`
      : "",
  ].join("");
  // ── On the home, a card IS the workspace ────────────────────────────────
  //
  // Clicking it switches to that brand and opens a fresh chat in it: on a page
  // whose subject is "which brand am I working in", the card is the door, the
  // way it is in every workspace picker. The fiche keeps the pen, with the
  // other management verbs.
  //
  // ⚠️ This REVERSES what stood here for a commit — the body opening the fiche,
  // with a small "Switch" link carrying the scope move — argued from the
  // asymmetry of a mis-click (a page versus the whole app moving). The user's
  // call, and what makes it safe is that nothing is lost: the new chat is
  // empty, the crumb goes back, and the brand you left is one card away. The
  // Switch link went with it, redundant: a second control for what the whole
  // card now does.
  //
  // Flag OFF there is no workspace to enter, so the card keeps opening the
  // fiche and none of this renders.
  const currentTag = currentTagFor(ctx);
  const cardTitle = startChatTitle(ctx);
  // The tile's own pieces. What the two shapes must say IDENTICALLY — the
  // default star, the Current mark, the title of the click — comes from the
  // shared helpers above, the same rule topic-card.js follows for its shapes.
  const voiceHtml = voiceHeadline
    ? `<div class="contexts-card__voice">
        <i class="ap-icon-archie-official"></i>
        <span>${escapeText(voiceHeadline)}</span>
      </div>`
    : "";
  const briefHtml = summary
    ? `<p class="contexts-card__brief">${escapeText(summary)}</p>`
    : `<p class="contexts-card__brief contexts-card__brief--empty">${escapeText(playbookBrief(ctx))}</p>`;
  const countersHtml = `
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
      ${
        competitorCount
          ? `<span class="contexts-card__counter" title="${competitorCount} ${competitorCount === 1 ? "competitor" : "competitors"}">
              <i class="ap-icon-buildings"></i>
              <span>${competitorCount}</span>
            </span>`
          : ""
      }
    </div>
  `;
  const openAttrs = `
      data-contexts-card="${ctx.id}"
      role="button"
      tabindex="0"
      ${cardTitle ? `title="${escapeAttr(cardTitle)}" aria-label="${escapeAttr(cardTitle)}"` : ""}`;

  // ── The tile ────────────────────────────────────────────────────────────
  // The catalogue's own shape, flag OFF: a colour strip, the voice chip, three
  // counters, the palette, the hover toolbar. A Playbook is an OBJECT you
  // browse here. On the home the same Playbook is a row you pick from
  // (renderPlaybookRow), which is why the two shapes differ in everything but
  // the words they say.
  return `
    <article class="contexts-card contexts-card--${color}"${openAttrs}>
      <span class="contexts-card__swatch" aria-hidden="true"></span>

      <div class="contexts-card__actions" data-contexts-card-actions>${actions}</div>

      <header class="contexts-card__head">
        <h3 class="contexts-card__name">
          ${escapeText(ctx.name)}
          ${isDefaultBadge}
        </h3>
      </header>

      ${voiceHtml} ${briefHtml}

      <footer class="contexts-card__foot">
        ${countersHtml}
        <div class="contexts-card__meta">
          ${currentTag}
          ${ownerTag}
          ${dotsHtml}
        </div>
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

// A shared Playbook takes other people's work down with it, so the confirm says
// how many chats and what survives — not just "this will be removed".
function deleteBody(ctx) {
  if (ctx.scope !== "organization") {
    return `"${ctx.name}" will be removed. Chats using it will need a new Playbook.`;
  }
  const n = ctx.usedIn || 0;
  const who = n === 1 ? "1 chat" : `${n} chats`;
  return n
    ? `"${ctx.name}" is shared with your organisation and ${who} run on it. They keep the drafts already written — those can still be saved or scheduled — but they won't generate anything new.`
    : `"${ctx.name}" is shared with your organisation. It disappears from everyone's list. Playbooks duplicated from it are their own and stay untouched.`;
}

function bind(root) {
  root.addEventListener("click", (event) => {
    // The hero's two menus don't close themselves on an outside click. Before
    // the dispatch guards, so a click on empty page space shuts them. No
    // document listener — paint() recreates these nodes, and a document
    // listener would outlive them.
    const openPicker = root.querySelector("[data-home-pb][open]");
    if (openPicker && !openPicker.contains(event.target)) openPicker.removeAttribute("open");
    if (!event.target.closest(".home-hero__add")) closeAddMenu(root);

    // Add — the same menu the composer carries, launching instead of staging.
    if (event.target.closest("[data-home-add-toggle]")) {
      event.preventDefault();
      const menu = root.querySelector("[data-home-add-menu]");
      const toggle = root.querySelector("[data-home-add-toggle]");
      if (menu) {
        menu.hidden = !menu.hidden;
        toggle?.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
      }
      return;
    }
    const addItem = event.target.closest("[data-home-add]");
    if (addItem) {
      event.preventDefault();
      closeAddMenu(root);
      startFromHomeAdd(root, addItem.dataset.homeAdd);
      return;
    }
    const addConnector = event.target.closest("[data-home-add-connector]");
    if (addConnector) {
      event.preventDefault();
      closeAddMenu(root);
      startFromHomeAdd(root, "connector", addConnector.dataset.homeAddConnector);
      return;
    }

    // Tabs — the state lives in the URL, so the router repaints and Back works.
    const tabBtn = event.target.closest("[data-home-tab]");
    if (tabBtn) {
      event.preventDefault();
      const next = tabBtn.dataset.homeTab;
      if (next !== activeTab()) setHashQuery("/home", { tab: next });
      return;
    }

    // Picking a brand in the hero writes NOTHING but the pick. The scope moves
    // on Send, which is the explicit commit — a picker that silently re-scoped
    // the app is the exact failure active-playbook.js's header describes.
    // Repaint only the picker: the textarea beside it holds what the reader
    // typed, and a full paint would throw it away.
    const pbPick = event.target.closest("[data-home-pb-pick]");
    if (pbPick) {
      event.preventDefault();
      pageState.pickedPlaybookId = pbPick.dataset.homePbPick;
      const host = root.querySelector("[data-home-pb]");
      if (host) host.outerHTML = renderHeroPicker(pickedPlaybook(), usableContexts());
      return;
    }

    // A workflow card. Same three actions the chat's hero dispatches, minus the
    // session it has and this page hasn't.
    const starter = event.target.closest("[data-starter-action]");
    if (starter) {
      event.preventDefault();
      startFromStarter(starter.dataset.starterAction);
      return;
    }

    if (event.target.closest("[data-home-send]")) {
      event.preventDefault();
      submitHomePrompt(root);
      return;
    }

    // A chat row. Opening a chat from up here has to re-scope: otherwise the
    // reader lands on a conversation the rail beside it doesn't list.
    const chatRow = event.target.closest("[data-home-chat]");
    if (chatRow) {
      openChatFromHome(chatRow.dataset.homeChat);
      return;
    }

    const shareBtn = event.target.closest("[data-contexts-share]");
    if (shareBtn) {
      event.stopPropagation();
      // The store notifies on commit and this screen is subscribed, so the card's
      // mark repaints on its own — no onDone needed here.
      openShareModal({ contextId: shareBtn.dataset.contextsShare });
      return;
    }
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
        window.sessionStorage.setItem("welcomeAltReturnTo", catalogueRoute());
      } catch {
        /* ignore */
      }
      setHandoff("pendingStartContextBuilder", { flow: "alt", prefilledUrl: "", returnTo: catalogueRoute() });
      navigate(`/session/welcome-alt-${Date.now().toString(36)}`);
      return;
    }
    if (event.target.closest("[data-contexts-clear-query]")) {
      pageState.query = "";
      paint();
      return;
    }
    const dupBtn = event.target.closest("[data-contexts-duplicate]");
    if (dupBtn) {
      event.stopPropagation();
      const copy = duplicateContext(dupBtn.dataset.contextsDuplicate);
      if (copy) {
        import("../components/toast.js?v=1224").then(({ showToast }) => showToast("Playbook duplicated"));
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
        import("../components/toast.js?v=1224").then(({ showToast }) =>
          showToast("Can't delete the last Playbook — every chat needs one."),
        );
        return;
      }
      // FIND-C1: DS confirm-modal so the delete prompt is keyboard-
      // accessible, themed, and consistent with the rest of the prototype.
      openConfirmModal({
        title: "Delete Playbook?",
        body: deleteBody(ctx),
        confirmLabel: "Delete Playbook",
        cancelLabel: "Keep",
        danger: true,
        onConfirm: () => {
          deleteContext(ctx.id);
          import("../components/toast.js?v=1224").then(({ showToast }) => showToast("Playbook deleted"));
        },
      });
      return;
    }
    // The kebab and its menu are not the card: without this the trigger would
    // fall through to the card fallback below and enter the workspace.
    // more-menu.js owns the toggle itself, on the document.
    if (event.target.closest("[data-playbook-more]") || event.target.closest(".home-playbooks__more-menu")) {
      return;
    }
    // Card click — anywhere outside the action buttons. On the home it enters
    // the workspace (see renderContextCard); flag OFF it opens the fiche for
    // inspection, as it always did. The action buttons stop propagation so
    // they win over this fallback.
    const card = event.target.closest("[data-contexts-card]");
    if (card) {
      enterWorkspace(card.dataset.contextsCard);
      return;
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-contexts-search]")) {
      pageState.query = event.target.value || "";
      // Repaint the body in place so empty <-> grid transitions both work
      // without losing the search field's focus — through renderTabBody(), the
      // one renderer the full paint also uses.
      const body = root.querySelector(".contexts-view__body");
      if (body) body.innerHTML = renderTabBody();
      return;
    }
    // Typing in the hero: the only thing that changes is whether Send can fire.
    // Patched by hand, never repainted — a repaint would take the caret with it.
    if (event.target.matches("[data-home-prompt]")) {
      const send = root.querySelector("[data-home-send]");
      if (send) send.disabled = !event.target.value.trim();
    }
  });

  root.addEventListener("keydown", (event) => {
    // Enter sends, Shift+Enter is a newline — the composer's contract, because
    // this is the same gesture one screen earlier.
    if (event.target.matches("[data-home-prompt]") && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitHomePrompt(root);
      return;
    }
    // Neither a <tr role="button"> nor an <article role="button"> is natively
    // activatable, and both are now this page's primary targets.
    if (event.key !== "Enter" && event.key !== " ") return;
    const chatRow = event.target.closest("[data-home-chat]");
    if (chatRow) {
      event.preventDefault();
      openChatFromHome(chatRow.dataset.homeChat);
      return;
    }
    const card = event.target.closest("[data-contexts-card]");
    if (card) {
      event.preventDefault();
      enterWorkspace(card.dataset.contextsCard);
    }
  });
}

// A Playbook card, activated. In workspace mode that means: work in this brand
// — switch the scope, then open a fresh chat bound to it, the same landing
// "Start a chat" gives on the fiche. `?contextId=` rather than `/`, which would
// resolve to whatever chat the brand last had: this page is a launcher, and the
// gesture is "start", not "resume". Flag OFF, there is no workspace to enter and
// the card keeps opening the fiche.
function enterWorkspace(id) {
  if (!id) return;
  if (!isWorkspaceMode()) {
    navigate(`/playbook/${id}`);
    return;
  }
  setActivePlaybook(id);
  closeRightPanel();
  navigate(`/session/new-${Date.now().toString(36)}?contextId=${encodeURIComponent(id)}`);
}

// ── Starting a chat from the home ─────────────────────────────────────────
//
// The Playbook and the chat's NAME ride in the URL, because session.js resolves
// `?contextId=` and `?title=` as it mints a `new-*` session — so the chat is
// bound and named on its first paint. Only the text needs a bridge, and a
// single-use handoff is that bridge.
//
// setActivePlaybook BEFORE navigate, like every other switch here: the other
// order is what leaves the rail naming one brand above another's page.
function submitHomePrompt(root) {
  const field = root.querySelector("[data-home-prompt]");
  const text = (field?.value || "").trim();
  // Send is disabled while the field is empty; this is the keyboard's guard.
  // sendMessage() itself returns early on empty text, so an empty submit would
  // open a chat and post nothing — which reads as a bug.
  if (!text) return;
  const picked = pickedPlaybook();
  if (!picked) return;
  setActivePlaybook(picked.id);
  setHandoff("pendingHomePrompt", { text });
  const params = new URLSearchParams({ contextId: picked.id, title: chatNameFromPrompt(text) });
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
}

// A workflow, launched from the home. Batch and Clip Studio each run in their
// own transient session and already read `playbookForNewWork()` when they
// start — which is the ACTIVE Playbook — so switching first is what binds them
// to the brand picked in the hero. Their handoffs are the ones session.js
// consumes synchronously on a `batch-*` / `clip-studio-*` id, unchanged.
//
// Top posts has no session of its own: it runs IN a chat, so the home mints one
// and rides `pendingHomeAdd` — with the studio kind, `startTopPostsFlow`, which
// is what the card opens in the hero (the Add menu's row is the inline variant;
// both exist in the chat too).
function startFromStarter(action) {
  const picked = pickedPlaybook();
  if (!picked) return;
  setActivePlaybook(picked.id);
  closeRightPanel();
  const stamp = Date.now().toString(36);
  if (action === "open-batch") {
    setHandoff("pendingStartBatch", {});
    navigate(`/session/batch-${stamp}`);
    return;
  }
  if (action === "open-video-clips") {
    setHandoff("pendingStartClipStudio", {});
    navigate(`/session/clip-studio-${stamp}`);
    return;
  }
  if (action === "open-top-posts") {
    setHandoff("pendingHomeAdd", { kind: "top-posts-studio", connectorId: null });
    navigate(`/session/new-${stamp}?contextId=${encodeURIComponent(picked.id)}`);
  }
}

function closeAddMenu(root) {
  const menu = root.querySelector("[data-home-add-menu]");
  if (menu && !menu.hidden) {
    menu.hidden = true;
    root.querySelector("[data-home-add-toggle]")?.setAttribute("aria-expanded", "false");
  }
}

// An Add item, launched. Same two beats as Send — switch, then mint the chat —
// with the intent riding across in `pendingHomeAdd` for session.js to dispatch.
// "Browse connectors" is the exception: a gallery is a page, not a chat.
//
// Anything already typed comes ALONG: the reader wrote it, and dropping it
// because they then reached for Add would be the worst kind of quiet loss.
function startFromHomeAdd(root, kind, connectorId) {
  if (kind === "connectors") {
    navigate("/connectors");
    return;
  }
  const picked = pickedPlaybook();
  if (!picked) return;
  const field = root.querySelector("[data-home-prompt]");
  const text = (field?.value || "").trim();
  setActivePlaybook(picked.id);
  setHandoff("pendingHomeAdd", { kind, connectorId: connectorId || null });
  if (text) setHandoff("pendingHomePrompt", { text });
  const params = new URLSearchParams({ contextId: picked.id });
  if (text) params.set("title", chatNameFromPrompt(text));
  closeRightPanel();
  navigate(`/session/new-${Date.now().toString(36)}?${params.toString()}`);
}

// The chat's name IS the ask, truncated on a word. No shared helper to reuse:
// session.js's own is private and dates the chat ("Chat · Jun 3, 14:20"), which
// says less than the sentence the reader just typed.
function chatNameFromPrompt(text) {
  const line = String(text).split("\n")[0].trim();
  if (line.length <= 60) return line;
  return `${line.slice(0, 59).replace(/\s+\S*$/, "")}…`;
}

function openChatFromHome(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;
  // A chat with no Playbook — or one whose fiche I can't open — is left alone:
  // it lives in every workspace by construction, and switching to a brand I
  // cannot view would break the scope's own guarantee.
  const ctx = chatPlaybook(session);
  if (ctx) setActivePlaybook(ctx.id);
  closeRightPanel();
  navigate(`/session/${session.id}`);
}
