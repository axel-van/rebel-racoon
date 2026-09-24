// The Topic dialog — one dialog, two views: the ARTICLE and its HISTORY.
//
//   openTopicArticle(topicId)        a row in the in-chat "Fresh topics" list
//
// ⚠️ It used to open on a LIST too — the composer's "Pick from the Topic Feed"
// listed the feed's draft-ready Topics here and a card's body opened the article
// inside. That entry point is an in-thread widget now (topic-flow.js
// startTopicPickerInline, the same shape as "Top performing posts"), so the list
// view, its back action and `openTopicPicker` are gone: a dialog view nothing
// opens reads as a live entry point. `git log -S renderListView` has it.
//
// ── One article, not two ───────────────────────────────────────────────────
// The body and the verbs come from topic-article.js — the same functions the feed
// renders beside its list. A second copy of the article for the dialog is exactly
// how a card and the thing it opens end up saying different sentences about the
// same Topic.
//
// The article view is a proper modal: a real HEADER (the Topic's title +
// provenance, rendered by renderTopicHeader with the close × over its corner), a
// two-column BODY (analysis left, a full-height grey posts panel right, flush to
// the edges), and the FOOTER (History + the verbs). The history view leaves the
// header empty and titles itself inside the scrolling body. paint() also writes
// the Topic's title into the dialog's aria-label.

import { html, raw, escapeHtml } from "../utils.js?v=1232";
import { requestOpen, notifyClose } from "../modal-coordinator.js?v=1232";
import {
  renderTopicArticle,
  renderTopicActions,
  renderTopicTrail,
  renderTopicPosts,
  renderTopicHeader,
} from "../topic-article.js?v=1232";
import { getTopicById, topicTitle } from "../topics-store.js?v=1232";
import { findTopicSource } from "../topics-catalog.js?v=1232";
import { useTopicInChat } from "../topic-flow.js?v=1232";

const MODAL_ID = "topic-picker";

let backdrop, modal, headerEl, bodyEl, footEl;
let initialized = false;
// { view: "article" | "history", topicId, menuOpen }
let state = null;

const HTML = `
<div class="app-modal-backdrop topic-picker__backdrop" id="topicPickerBackdrop" hidden></div>
<aside
  class="ap-dialog topic-picker"
  id="topicPickerModal"
  role="dialog"
  aria-modal="true"
  aria-label="Topic"
  aria-hidden="true"
>
  <button class="ap-dialog-close" type="button" data-topic-picker-close aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <!-- The modal HEADER — the article view fills it with the Topic's title +
       provenance; the list and history views leave it empty and title themselves
       inside the scrolling body. The close × above sits over its top-right. -->
  <div id="topicPickerHeader"></div>
  <div class="topic-picker__body" id="topicPickerBody"></div>
  <!-- The DS dialog footer is a SIBLING of the scrolling body, never inside it:
       that is what pins it to the dialog's bottom edge without position sticky
       and without negative margins clawing back the scroller's padding.
       NOTE no backticks in here - this string is a template literal. -->
  <div id="topicPickerFoot"></div>
</aside>`;

function injectOnce() {
  if (initialized) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = HTML;
  document.body.appendChild(wrapper);

  backdrop = document.getElementById("topicPickerBackdrop");
  modal = document.getElementById("topicPickerModal");
  headerEl = document.getElementById("topicPickerHeader");
  bodyEl = document.getElementById("topicPickerBody");
  footEl = document.getElementById("topicPickerFoot");

  backdrop.addEventListener("click", close);

  // One delegated listener on the dialog, like every other surface in this app.
  modal.addEventListener("click", (event) => {
    // Both hooks: the dialog's own × and the article footer's Close, which is
    // shared with the feed's pane and emits data-topic-close there too.
    if (event.target.closest("[data-topic-picker-close]") || event.target.closest("[data-topic-close]")) {
      close();
      return;
    }
    if (event.target.closest("[data-topic-history-back]")) {
      state = { ...state, view: "article", menuOpen: false };
      paint();
      bodyEl.scrollTop = 0;
      return;
    }
    // ⚠️ The trail opens as a VIEW here, never as a modal. This dialog is the
    // active overlay, and modal-coordinator's requestOpen closes the active
    // overlay — so topic-history-modal launched from in here would close the
    // picker on its way up. Same trail, host's own placement.
    const trailBtn = event.target.closest("[data-topic-trail-menu]");
    if (trailBtn) {
      state = { ...state, menuOpen: !state.menuOpen };
      paint();
      return;
    }
    if (event.target.closest("[data-topic-trail]")) {
      state = { ...state, view: "history", menuOpen: false };
      paint();
      bodyEl.scrollTop = 0;
      return;
    }
    // Anywhere else in the dialog closes an open kebab, the same as the feed.
    if (state?.menuOpen && !event.target.closest(".topic-article__menu")) {
      state = { ...state, menuOpen: false };
      paint();
    }
    const use = event.target.closest("[data-topic-use]");
    if (use) {
      // Close FIRST. useTopicInChat navigates, and a dialog still mounted over
      // the new chat would have to be dismissed by a reader who did not open it.
      const id = use.dataset.topicUse;
      close();
      useTopicInChat(id);
      return;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !modal.classList.contains("open")) return;
    event.preventDefault();
    close();
  });

  initialized = true;
}

export function init() {
  injectOnce();
}

/** One Topic's article, from a row in the in-chat list. */
export function openTopicArticle(topicId) {
  injectOnce();
  const topic = getTopicById(topicId);
  // A link to a Topic that no longer exists opens nothing and goes nowhere.
  if (!topic) return;
  requestOpen(MODAL_ID, close);
  state = { view: "article", topicId, menuOpen: false };
  show();
}

function show() {
  paint();
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  bodyEl.scrollTop = 0;
}

export function close() {
  if (!initialized) return;
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  state = null;
  notifyClose(MODAL_ID);
}

// ─── Render ────────────────────────────────────────────────────────────────

function paint() {
  if (!state) return;
  const isArticle = state.view === "article" && !!state.topicId;
  const articleTopic = isArticle ? getTopicById(state.topicId) : null;
  // The header carries the identity ONLY on the article view (title + provenance,
  // with the close × over its corner); the history view titles itself inside the
  // scrolling body, so the header is empty for it.
  headerEl.innerHTML = articleTopic ? renderArticleHeader(articleTopic) : "";
  bodyEl.innerHTML = articleTopic ? renderArticleBody(articleTopic) : renderHistoryView();
  // Only the two-column article view is wide; the history trail is a single
  // column and a 960px dialog would stretch it across dead width.
  modal.classList.toggle("topic-picker--wide", isArticle);
  // Only the article has verbs; the trail is not a decision — its way back is the
  // Back link.
  const openTopic = state.view === "article" && state.topicId ? getTopicById(state.topicId) : null;
  // History moved off the header kebab into a footer button on the LEFT, opposite
  // the verbs. Only when there is a trail to show — same gate the kebab used.
  const hasTrail = (openTopic?.history || []).length > 0;
  const historyBtn = hasTrail
    ? `<button type="button" class="ap-button transparent grey" data-topic-trail="${openTopic.id}"><i class="ap-icon-history"></i><span>History</span></button>`
    : "";
  footEl.innerHTML = openTopic
    ? `<div class="ap-dialog-footer topic-picker__foot">
        <div class="ap-dialog-footer-left">${historyBtn}</div>
        <div class="ap-dialog-footer-right">${renderTopicActions(openTopic, { close: null })}</div>
      </div>`
    : "";
  const topic = state.topicId ? getTopicById(state.topicId) : null;
  modal.setAttribute("aria-label", topic ? `Topic: ${escapeHtml(topic.article?.title || topic.headline)}` : "Topic");
}

// ── The article — a proper modal: header, two-column body, footer ──────────
// The HEADER holds the identity — the Topic's title with "Competitors · age ·
// status" under it (renderTopicHeader titleFirst) — and the close × sits over its
// top-right, so the title and the way out live in the modal's header. The BODY
// below splits: the analysis scrolls on the LEFT, the contributing posts fill a
// GREY PANEL on the RIGHT that spans the full height between header and footer,
// flush to the dialog's edges. Topic history is a footer button (withMenu false,
// so no header kebab).
function renderArticleHeader(topic) {
  const source = findTopicSource(topic.sourceId);
  return html`<div class="ap-dialog-header topic-picker__article-header">
    ${raw(renderTopicHeader(topic, { source, titleFirst: true, withMenu: false }))}
  </div>`;
}

function renderArticleBody(topic) {
  const source = findTopicSource(topic.sourceId);
  const posts = topic.posts || [];
  return html`<div class="topic-picker__split">
    <div class="topic-picker__article">
      ${raw(renderTopicArticle(topic, { source, withHeader: false, withPosts: false }))}
    </div>
    ${raw(
      posts.length
        ? html`<aside class="topic-picker__posts-panel">${raw(renderTopicPosts(topic, { collapsible: false }))}</aside>`
        : "",
    )}
  </div>`;
}

// ── The trail, as this host's second view ──────────────────────────────────
// The feed opens the same rows in a modal; here they replace the dialog's body,
// with a Back that returns to the article. Swapping the body rather than opening
// a second overlay means no second modal and no second trail renderer.
function renderHistoryView() {
  const topic = getTopicById(state.topicId);
  if (!topic) return "";
  return html`<button type="button" class="ap-link standalone small topic-picker__back" data-topic-history-back>
      <i class="ap-icon-arrow-left" aria-hidden="true"></i><span>Back to the topic</span>
    </button>
    <div class="topic-picker__history">
      <h2 class="topic-picker__history-title">Topic history</h2>
      <p class="topic-picker__history-sub">${topicTitle(topic)}</p>
      ${raw(renderTopicTrail(topic))}
    </div>`;
}
