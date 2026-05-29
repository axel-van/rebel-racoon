// Per-session list of source mentions surfaced as pills inside the
// composer card. The user adds a mention by clicking a source row in
// the conversation status card; pills can be dismissed individually
// via their trailing ×.
//
// State is kept in memory (Map<sessionId, string[]>) and survives
// route changes for the duration of the page. Cleared when the
// session is deleted (clearSession).
//
// Public API:
//   getMentions(sessionId)     → string[]
//   addMention(sessionId, name)
//   removeMention(sessionId, name)
//   subscribe(sessionId, fn)   → unsubscribe
//   clearSession(sessionId)
//   renderInto(container, sessionId)  // helper for session.js composer

import { getIdeas } from "./library.js?v=31";

// Idea kind → DS .ap-tag color variant. Mirrors the per-kind palette the
// right-panel idea cards use (rpanel-ideas__kind--*), so a mentioned idea's
// pill carries the same color as its kind tag. Sources / unknown names fall
// back to blue.
const KIND_TAG_COLOR = {
  stat: "blue",
  quote: "menthol",
  hook: "tagOrange",
  story: "grey",
  insight: "green",
};

// Resolve a mention name to its tag color: match the session's ideas by
// title and use the kind color; otherwise default blue.
function tagColorForName(sessionId, name) {
  const idea = (getIdeas(sessionId) || []).find((i) => i.title === name);
  return (idea && KIND_TAG_COLOR[idea.kind]) || "blue";
}

const mentionsBySession = new Map();
const subscribers = new Map();

function ensure(sessionId) {
  if (!mentionsBySession.has(sessionId)) mentionsBySession.set(sessionId, []);
  return mentionsBySession.get(sessionId);
}

function getMentions(sessionId) {
  return ensure(sessionId).slice();
}

export function addMention(sessionId, name) {
  if (!sessionId || !name) return;
  const list = ensure(sessionId);
  // De-dupe — re-clicking the same source shouldn't stack duplicates.
  if (list.includes(name)) return;
  list.push(name);
  notify(sessionId);
}

export function removeMention(sessionId, name) {
  const list = mentionsBySession.get(sessionId);
  if (!list) return;
  const idx = list.indexOf(name);
  if (idx < 0) return;
  list.splice(idx, 1);
  notify(sessionId);
}

export function clearSession(sessionId) {
  mentionsBySession.delete(sessionId);
  notify(sessionId);
}

export function subscribe(sessionId, fn) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  const set = subscribers.get(sessionId);
  set.add(fn);
  return () => set.delete(fn);
}

function notify(sessionId) {
  const set = subscribers.get(sessionId);
  if (!set) return;
  const snap = getMentions(sessionId);
  set.forEach((fn) => {
    try {
      fn(snap);
    } catch {}
  });
}

// Fill the given container with pills for each mention in the session.
// Caller is expected to wire up the × click delegate (handled in
// session.js's composer event listener for symmetry with the other
// composer affordances).
export function renderInto(container, sessionId) {
  if (!container) return;
  const list = getMentions(sessionId);
  if (list.length === 0) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }
  container.hidden = false;
  // DS-compliant pill: `.ap-tag.mini.blue` is the compact variant.
  // The DS only supports `ap-icon-close` inside a tag, so no file icon —
  // the label alone carries the identity. Close button is auto-detected
  // via :has(> button), no extra class needed.
  container.innerHTML = list
    .map(
      (name) => `
    <span class="ap-tag ${tagColorForName(sessionId, name)} composer-mention" data-composer-mention="${escapeAttr(name)}">
      <span class="composer-mention__label">${escapeHtml(name)}</span>
      <button
        type="button"
        class="composer-mention__remove"
        data-composer-mention-remove="${escapeAttr(name)}"
        aria-label="Remove ${escapeAttr(name)} mention"
        title="Remove mention"
      >
        <i class="ap-icon-close"></i>
      </button>
    </span>
  `,
    )
    .join("");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}
