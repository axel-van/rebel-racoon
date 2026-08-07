// The topic dialog — one dossier, read end to end.
//
// A topic is an argument: a claim in the headline, the reasoning underneath, and
// the posts that back it. This is where that argument gets read, so the whole
// surface is optimised for prose — 720px (the connectors dialog's 920 overshoots
// a comfortable measure), one column, no interactive furniture between the
// paragraphs.
//
// Why a modal rather than a route: reading a topic is read-then-decide. The two
// decisions (start a chat, or not for me) have to sit with the evidence, and a
// modal keeps the feed underneath as the return context with no navigation to
// unwind.
//
// Standard lifecycle via modal-coordinator — one overlay at a time, focus
// restore, Esc / backdrop dismissal. Mirrors connectors-modal.js.

import { requestOpen, notifyClose, bindOverlayDismissal } from "../modal-coordinator.js?v=21";
import { html, raw } from "../utils.js?v=21";
import { getTopicById, markSeen, dismissTopic, topicWhen, subscribe as subscribeTopics } from "../topics-store.js?v=10";
import { findTopicSource } from "../topics-catalog.js?v=3";
import { getContextById } from "../contexts-store.js?v=54";
import { openTopicInChat } from "../topic-flow.js?v=15";
import { renderSocialPostCard } from "./social-post-card.js?v=9";

const MODAL_ID = "topic";

let backdrop, modal, headerEl, contentEl, footerEl;
let initialized = false;
let unsubscribe = null;
let topicId = null;
// Called on dismissal so the surface underneath can offer its own Undo toast
// instead of this module owning a second one.
let onDismiss = null;

const HTML = `
<div class="app-modal-backdrop topic-modal__backdrop" id="topicModalBackdrop" hidden></div>
<aside
  class="ap-dialog topic-modal"
  id="topicModal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="topicModalTitle"
  aria-hidden="true"
>
  <div class="ap-dialog-header topic-modal__header" id="topicModalHeader"></div>
  <button class="ap-dialog-close" type="button" id="topicModalClose" aria-label="Close">
    <i class="ap-icon-close"></i>
  </button>
  <div class="ap-dialog-content topic-modal__content" id="topicModalContent"></div>
  <div class="ap-dialog-footer topic-modal__footer" id="topicModalFooter"></div>
</aside>
`;

export function init() {
  if (initialized) return;
  initialized = true;
  document.body.insertAdjacentHTML("beforeend", HTML);

  backdrop = document.getElementById("topicModalBackdrop");
  modal = document.getElementById("topicModal");
  headerEl = document.getElementById("topicModalHeader");
  contentEl = document.getElementById("topicModalContent");
  footerEl = document.getElementById("topicModalFooter");

  modal.addEventListener("click", onClick);
  bindOverlayDismissal({ modal, backdrop, close });
}

// The modal is appended to <body>, outside any screen's delegated root, so it
// handles its own clicks. bindOverlayDismissal wires only the backdrop and Esc —
// the ✕ is ours.
function onClick(event) {
  if (event.target.closest("#topicModalClose") || event.target.closest("[data-modal-close]")) {
    close();
    return;
  }

  const chat = event.target.closest("[data-topic-chat]");
  if (chat) {
    const id = chat.dataset.topicChat;
    // Close first: openTopicInChat navigates, and an overlay left open across a
    // route change would sit on top of the new chat.
    close();
    openTopicInChat(id);
    return;
  }

  const skip = event.target.closest("[data-topic-dismiss]");
  if (skip) {
    const id = skip.dataset.topicDismiss;
    // Capture the callback BEFORE close(), which clears it. Calling it afterwards
    // was a silent no-op, so "Not for me" dismissed the topic without ever raising
    // the Undo toast the feed offers for the card's own Dismiss.
    const notify = onDismiss;
    close();
    dismissTopic(id);
    notify?.(id);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.topicId
 * @param {(id: string) => void} [opts.onDismiss] — fired after a dismissal from
 *   the footer, so the calling surface can raise its own Undo toast.
 */
export function open({ topicId: id, onDismiss: dismissCb = null } = {}) {
  if (!initialized) init();
  if (!getTopicById(id)) return;
  requestOpen(MODAL_ID, close);
  topicId = id;
  onDismiss = dismissCb;
  backdrop.hidden = false;
  backdrop.classList.add("open");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-modal");
  // Opening it is reading it.
  markSeen(id);
  // Stay live: a dismissal from the feed underneath shouldn't leave a stale
  // action row on screen.
  if (!unsubscribe) unsubscribe = subscribeTopics(() => render());
  render();
  contentEl.scrollTop = 0;
}

export function close() {
  if (!initialized) return;
  modal.classList.remove("open");
  backdrop.classList.remove("open");
  backdrop.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-modal");
  topicId = null;
  onDismiss = null;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  notifyClose(MODAL_ID);
}

export function isOpen() {
  return initialized && modal.classList.contains("open");
}

/** The topic currently being read, or null. */
export function getOpenTopicId() {
  return isOpen() ? topicId : null;
}

// ─── Render ────────────────────────────────────────────────────────────────

function render() {
  const topic = getTopicById(topicId);
  if (!topic) {
    close();
    return;
  }
  const source = findTopicSource(topic.sourceId);
  const playbook = getContextById(topic.contextId);

  // The headline IS the title — a dossier's claim is the thing you came to
  // read, and a generic "Topic" heading above it would only push it down.
  //
  // The provenance is a KICKER ABOVE it, not a subtitle below: same order as the
  // feed card the reader just clicked, so the dialog reads as that card opened
  // rather than as a different object. The Playbook stays a `.ap-tag` here for the
  // same reason it is one on the card — its own name contains a middot
  // ("Pawtrack · always-on"), and as plain text in a middot-separated line it
  // turned the kicker into four dots in a row.
  headerEl.innerHTML = html`
    <p class="topic-modal__kicker">
      ${raw(
        source
          ? html`<span class="topic-badge topic-badge--${source.accent}" aria-hidden="true"
                ><i class="${source.icon}"></i></span
              ><span class="topic-modal__source">${source.name}</span> <span aria-hidden="true">·</span>`
          : "",
      )}
      <span>${topicWhen(topic.ageDays)}</span>
      ${raw(playbook ? html`<span class="ap-tag grey mini topic-modal__playbook">${playbook.name}</span>` : "")}
    </p>
    <h2 class="ap-dialog-title topic-modal__title" id="topicModalTitle">${topic.headline}</h2>
  `;

  const posts = topic.posts || [];
  contentEl.innerHTML = html`
    <section class="topic-modal__analysis">
      <p class="topic-modal__eyebrow"><i class="ap-icon-sparkles" aria-hidden="true"></i><span>What I found</span></p>
      <h3 class="topic-modal__analysis-title">${topic.analysisTitle}</h3>
      <div class="topic-modal__prose">${raw((topic.analysis || []).map((p) => html`<p>${p}</p>`).join(""))}</div>
    </section>

    ${raw(
      posts.length
        ? html`<section class="topic-modal__evidence">
            <header class="topic-modal__evidence-head">
              <h3 class="topic-modal__evidence-title">Source posts</h3>
              <span class="ap-counter normal grey">${posts.length}</span>
            </header>
            <div class="topic-modal__posts">${raw(posts.map((p) => renderSocialPostCard(p)).join(""))}</div>
          </section>`
        : "",
    )}
  `;

  // Orange for the AI/spotlight action, grey ghost for the quiet one — the
  // app-wide convention.
  footerEl.innerHTML = html`
    <button type="button" class="ap-button primary orange" data-topic-chat="${topic.id}">
      <i class="ap-icon-single-chat-bubble" aria-hidden="true"></i>
      <span>Start a chat</span>
    </button>
    <button type="button" class="ap-button ghost grey" data-topic-dismiss="${topic.id}">
      <span>Not for me</span>
    </button>
  `;
}
