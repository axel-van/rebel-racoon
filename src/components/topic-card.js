// topic-card — one dossier, summarised, in the /topics feed.
//
// Pure render, no store reads: the screen resolves the source and the Playbook
// and passes them in, so the card stays a function of its arguments and can be
// rendered anywhere (a feed, a filtered list) without knowing where its data
// came from. Interaction is delegated — every hook is a data-* attribute read by
// screens/topics.js.
//
//   renderTopicCard(topic, { source, playbookName }) → one card
//
// The card body is one big button opening the dialog, and the two actions sit
// outside it. That's why the actions live in a sibling footer rather than inside
// the clickable region: a button inside a button is invalid HTML, and the browser
// resolves the nesting unpredictably.

import { html, raw } from "../utils.js?v=21";
import { topicWhen } from "../topics-store.js?v=2";

// Avatar tints, mirroring social-post-card's set — the footer stacks the post
// authors, so the two surfaces have to agree on what a given accent looks like.
const ACCENTS = new Set([
  "grey",
  "purple",
  "red",
  "menthol",
  "orange",
  "green",
  "electric-blue",
  "yellow",
  "soft-blue",
]);

const MAX_FACES = 3;

function accentFor(author) {
  const a = ((author && author.accent) || "").toLowerCase();
  return ACCENTS.has(a) ? a : "grey";
}

// The authors behind the dossier, as a DS avatar group. Reversed because
// .ap-avatar-group is row-reverse — the first author has to end up leftmost, and
// on top of the stack.
function renderFaces(posts) {
  const shown = posts.slice(0, MAX_FACES);
  const overflow = posts.length - shown.length;
  const faces = shown
    .slice()
    .reverse()
    .map((p) => {
      const author = p.author || {};
      return html`<span class="ap-avatar size-24 social-post-card__avatar" data-accent="${accentFor(author)}"
        ><span class="ap-avatar-initials">${author.initials || "?"}</span></span
      >`;
    })
    .join("");
  const rest = overflow > 0 ? html`<span class="ap-avatar-group-overflow">+${overflow}</span>` : "";
  // No size modifier on the group: its overflow chip defaults to 24px, which is
  // exactly the avatar size used here. Adding `size-32` would resize the chip
  // alone and break the row.
  return html`<span class="ap-avatar-group topic-card__faces" aria-hidden="true">${raw(rest)}${raw(faces)}</span>`;
}

export function renderTopicCard(topic, { source = null, playbookName = "" } = {}) {
  if (!topic) return "";
  const posts = topic.posts || [];
  const postLabel = posts.length === 1 ? "1 post" : `${posts.length} posts`;

  return html`<article class="topic-card${raw(topic.unseen ? " is-unseen" : "")}" data-topic-id="${topic.id}">
    <button type="button" class="topic-card__body" data-topic-open="${topic.id}">
      <!-- Kicker left, marks right — two stable anchors instead of one queue of five
           chips. Scanning the feed you look for the SOURCE (which kind of listening
           found this) at a fixed left edge, and for the Playbook / New marks at a
           fixed right edge. In one flat row the badge stayed put but everything else
           slid sideways with the length of the name before it. -->
      <span class="topic-card__eyebrow">
        <span class="topic-card__kicker">
          ${raw(
            source
              ? html`<span class="topic-badge topic-badge--${source.accent}" aria-hidden="true"
                    ><i class="${source.icon}"></i></span
                  ><span class="topic-card__source">${source.name}</span>
                  <span class="topic-card__dot" aria-hidden="true">·</span>`
              : "",
          )}
          <span class="topic-card__when">${topicWhen(topic.ageDays)}</span>
        </span>
        <span class="topic-card__marks">
          ${raw(playbookName ? html`<span class="ap-tag grey mini topic-card__playbook">${playbookName}</span>` : "")}
          <!-- "New" is a dot + a word styled by this screen, not a DS tag: the DS
               tag palette has no orange variant, and orange is what marks Archie's
               own contribution everywhere else in the app. -->
          ${raw(topic.unseen ? html`<span class="topic-card__new">New</span>` : "")}
        </span>
      </span>
      <span class="topic-card__headline">${topic.headline}</span>
      <span class="topic-card__summary">${topic.summary}</span>
    </button>
    <footer class="topic-card__foot">
      <span class="topic-card__evidence">
        ${raw(posts.length ? renderFaces(posts) : "")}
        <span class="topic-card__evidence-label">${postLabel}</span>
      </span>
      <span class="topic-card__actions">
        <button type="button" class="ap-button ghost grey" data-topic-dismiss="${topic.id}">
          <span>Dismiss</span>
        </button>
        <!-- secondary, not primary: nine filled orange buttons down a feed is a
             wall of spotlight and none of them reads as the important one. The
             dialog, where there's exactly one, keeps primary. -->
        <button type="button" class="ap-button secondary orange" data-topic-chat="${topic.id}">
          <i class="ap-icon-single-chat-bubble" aria-hidden="true"></i>
          <span>Start a chat</span>
        </button>
      </span>
    </footer>
  </article>`;
}
