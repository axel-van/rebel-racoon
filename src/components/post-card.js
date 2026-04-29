// post-card — full-fidelity LinkedIn-style draft preview card.
//
// Originally rendered inside the session screen's Posts tab (dropped at
// Lot 4.4). Lot 21 lifts the renderer out so the right-panel Drafts
// surface can use the rich format the user wanted instead of the
// compact BatchCard.
//
// Each card shows: author block (avatar + name + title + visibility),
// status pill or scheduled/error notice above the card, full body text
// + hashtags + CTA, image (or "Generate an image" placeholder),
// engagement stats, and a decorative LinkedIn-style action footer
// (Like / Comment / Repost / Send). To the right of the card sits an
// action stack — sparkles (rewrite) / calendar (schedule) / copy
// (duplicate) / trash (delete). Each carries a `data-post-*`
// attribute ; the consumer wires the actions via event delegation.
//
// Render is pure ; no module-local state. Caller passes the post
// object (cf. posts-store.js / mocks.js) and an optional `opts.focusPost`
// id used to apply the focus pulse animation when navigating in via
// `?focusPost=<id>`.

import { html, raw } from "../utils.js?v=20";

export function renderPostCard(post, opts = {}) {
  const editing = opts.editing === true;

  const statusPill = (() => {
    // "needs_fixes" surfaces above the card via renderPostErrors — no header pill.
    // "scheduled" surfaces above the card via renderPostScheduled — no header pill.
    if (post.status === "needs_fixes" || post.status === "scheduled") return "";
    return '<span class="ap-status green">Draft ready</span>';
  })();

  const bodyParagraphs = post.text.map((p) => `<p class="posts__card-paragraph">${p}</p>`).join("");

  const hashtags = post.hashtags.length
    ? `<p class="posts__card-hashtags">${post.hashtags.map((h) => `<a>#${h}</a>`).join(" ")}</p>`
    : "";

  const cta = post.cta ? `<p class="posts__card-cta">${post.cta}</p>` : "";

  // In edit mode the entire body (paragraphs + hashtags + CTA) collapses
  // into one contenteditable region. Hashtags lose their styling during
  // edit and re-style on save (per spec).
  const editorBody = editing
    ? `<div
        class="posts__card-body posts__card-editor"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        aria-label="Edit post body"
        data-post-editor="${post.id}"
        spellcheck="true"
      >${escapeForEditor(serializeBody(post))}</div>`
    : `<div class="posts__card-body">${bodyParagraphs} ${hashtags} ${cta}</div>`;

  const editActions = editing
    ? `<div class="posts__card-edit-actions">
        <button type="button" class="ap-button ghost grey" data-post-edit-cancel="${post.id}">Cancel</button>
        <button type="button" class="ap-button primary orange" data-post-edit-save="${post.id}">Save</button>
      </div>`
    : "";

  const stats = post.stats || {};
  const engagement =
    stats.likes || stats.comments || stats.reposts
      ? `
        <div class="posts__card-engagement">
          <span class="posts__card-reactions">
            <span class="posts__card-reaction">👍</span>
            <span class="posts__card-reaction">💡</span>
            <span class="posts__card-reaction-count">${stats.likes || 0}</span>
          </span>
          <span class="posts__card-meta muted">${stats.comments || 0} comments · ${stats.reposts || 0} reposts</span>
        </div>
      `
      : "";

  const imageBlock = post.imageUrl
    ? `<img class="posts__card-image" src="${post.imageUrl}" alt="Generated image for this post" />`
    : `<button type="button" class="posts__card-image-placeholder" data-post-image="${post.id}">
          <i class="ap-icon-sparkles-mermaid"></i>
          <span>Generate an image</span>
        </button>`;

  return html`
    <article class="posts__row ${opts.focusPost === post.id ? "is-focused" : ""}" data-post-id="${post.id}">
      <div class="posts__card-wrap">
        ${raw(renderPostErrors(post))} ${raw(renderPostScheduled(post))}
        <article class="ap-card posts__card ${editing ? "is-editing" : ""}">
          <header class="posts__card-header">
            <div class="posts__card-avatar" aria-hidden="true">${post.author.initials}</div>
            <div class="posts__card-author">
              <div class="row posts__card-author-row">
                <span class="posts__card-name">${post.author.name}</span>
                <span class="muted">· ${post.author.connection}</span>
              </div>
              <div class="muted posts__card-title">${post.author.title}</div>
              <div class="muted posts__card-meta">${post.timeLabel} · ${post.author.visibility}</div>
            </div>
            <div class="posts__card-status">${raw(statusPill)}</div>
          </header>

          ${raw(editorBody)} ${raw(editActions)} ${raw(imageBlock)} ${raw(engagement)}

          <!-- Footer is a non-interactive LinkedIn-style preview of the
               engagement bar — decoration only, not real actions (see
               aria-hidden). The actionable controls live in the
               .posts__row-actions stack to the right of the card. -->
          <footer class="posts__card-footer" aria-hidden="true">
            <span class="posts__card-action">
              <i class="ap-icon-thumb-up"></i>
              <span>Like</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-single-chat-bubble"></i>
              <span>Comment</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-repost"></i>
              <span>Repost</span>
            </span>
            <span class="posts__card-action">
              <i class="ap-icon-paper-plane"></i>
              <span>Send</span>
            </span>
          </footer>
        </article>
      </div>

      <div class="posts__row-actions" aria-label="Post actions">
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Edit post"
          title="Edit"
          data-post-edit="${post.id}"
        >
          <i class="ap-icon-pen"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Rewrite with AI"
          data-post-rewrite="${post.id}"
        >
          <i class="ap-icon-sparkles"></i>
        </button>
        <button type="button" class="ap-icon-button stroked" aria-label="Schedule post" data-post-schedule="${post.id}">
          <i class="ap-icon-calendar"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button stroked"
          aria-label="Duplicate post"
          data-post-duplicate="${post.id}"
        >
          <i class="ap-icon-copy"></i>
        </button>
        <button
          type="button"
          class="ap-icon-button stroked posts__row-action--danger"
          aria-label="Delete post"
          data-post-delete="${post.id}"
        >
          <i class="ap-icon-trash"></i>
        </button>
      </div>
    </article>
  `;
}

// "needs_fixes" notice — sits above the card. Surfaces every error from
// post.errors[], single-line for one error, bulleted list for multiple.
function renderPostErrors(post) {
  if (!post.errors?.length) return "";
  const body =
    post.errors.length === 1
      ? post.errors[0].message
      : `<ul class="posts__card-errors-list">${post.errors.map((e) => `<li>${e.message}</li>`).join("")}</ul>`;
  return `
    <div class="ap-infobox error" role="alert">
      <i class="ap-icon-error_fill" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-message">${body}</span>
        </div>
      </div>
    </div>
  `;
}

// Build the editable plain-text body shown inside the contenteditable
// region. Paragraphs separated by blank lines ; hashtags rendered as
// "#tag #tag2" on their own line ; CTA on its own line.
// The reverse parse lives in right-panel.js (parseEditorBody).
function serializeBody(post) {
  const parts = [];
  if (post.text?.length) parts.push(post.text.join("\n\n"));
  if (post.hashtags?.length) parts.push(post.hashtags.map((h) => `#${h}`).join(" "));
  if (post.cta) parts.push(post.cta);
  return parts.join("\n\n");
}

// HTML-escape user content before injecting into the contenteditable.
// innerText reads back the literal characters, so escaping here avoids
// the editor rendering injected markup on first paint.
function escapeForEditor(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "scheduled" notice — sits above the card with the scheduled-for label.
function renderPostScheduled(post) {
  if (post.status !== "scheduled") return "";
  const when = post.scheduledForLabel || "later";
  return `
    <div class="ap-status-card orange">
      <div class="upper">
        <i class="ap-icon-calendar" aria-hidden="true"></i>
        <div class="flow"><span>Scheduled</span> ${when}</div>
      </div>
    </div>
  `;
}
