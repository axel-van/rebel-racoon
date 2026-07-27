// Research flow — the actions on a delivered idea, and the recurring scan.
//
// A scan delivers IDEAS (research-store publishes them into the global library);
// the finding behind each one is its justification. So the actions here are
// about an idea, not about a finding:
//
//   writeIdea(id, { sessionId })   adopt it into a chat and start drafting
//   skipIdea(id)                   drop it, and never re-derive it
//   adoptAndDraft(sessionId, id)   the in-chat half of writeIdea
//   runScanAndAnnounce({ … })      scan + toast + the one-line chat notice
//
// It lives here rather than in the screen because several surfaces call the
// same entry points: the digest, the "Why this?" modal, and /ideas.
//
// WHICH CHAT? A delivered idea belongs to no conversation, and drafting is
// session-scoped end to end, so writing asks — the same chat-picker modal, with
// the same "no chats yet → mint one" shortcut, that the idea → draft path
// already uses. The pick rides across the navigation on a single-use handoff,
// consumed at session mount (screens/session.js).

import { setHandoff } from "./handoff.js?v=20";
import { navigate, getPath } from "./router.js?v=30";
import { showToast } from "./components/toast.js?v=20";
import { open as openChatPicker } from "./components/chat-picker-modal.js?v=62";
import { getSessions } from "./sessions-store.js?v=9";
import {
  getFinding,
  markUsed,
  dismissFinding as dismissInStore,
  restoreFinding,
  getResearchConfig,
  runScan,
} from "./research-store.js?v=6";
import { findResearchSource } from "./research-catalog.js?v=3";
import { postSelectionEcho, postAssistantMessage, postResearchDelivery } from "./assistant.js?v=61";
import { addReadySource } from "./sources-stream.js?v=54";
import { getIdeaById, addGlobalIdeas, adoptIdea, removeIdeasGlobally } from "./library.js?v=54";
import { startDraftFlow } from "./draft-flow.js?v=58";

export const HANDOFF_KEY = "pendingResearchIdea";

// A source row's filename is a one-line label; a finding's headline is a
// sentence. Trim it rather than letting it dominate the Sources panel.
function truncate(text, max) {
  const s = String(text || "");
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

// ── Entry points ──────────────────────────────────────────────────────────

/**
 * "Write it" — the primary action on a delivered idea.
 *
 * The idea already exists in the global library (a scan created it), it just
 * belongs to no conversation yet. Writing means adopting it into a chat, where
 * the draft flow lives, and going straight to the draft. No "convert" step: the
 * idea was the deliverable all along.
 *
 * @param {string} ideaId
 * @param {object} [opts]
 * @param {string|null} [opts.sessionId]  the chat to write in; null → ask
 */
export function writeIdea(ideaId, { sessionId = null } = {}) {
  const idea = getIdeaById(ideaId);
  if (!idea) return;

  if (sessionId) {
    adoptAndDraft(sessionId, ideaId);
    return;
  }

  const go = (targetId) => {
    setHandoff(HANDOFF_KEY, { ideaId });
    navigate(`/session/${targetId}`);
  };

  // No chats yet → nothing to choose between; mint one.
  if (getSessions().length === 0) {
    go(`new-${Date.now().toString(36)}`);
    return;
  }

  openChatPicker({
    onPick: (choice) => {
      if (!choice) return;
      go(choice.kind === "new" ? `new-${Date.now().toString(36)}` : choice.session.id);
    },
  });
}

/**
 * "Not for me" — drop a delivered idea.
 *
 * Two levels of memory, both needed: the idea leaves the library (so the digest
 * and /ideas both lose it), and its finding's dedupeKey is remembered so no
 * later scan re-derives the same thing. Undo restores both.
 */
export function skipIdea(ideaId) {
  const idea = getIdeaById(ideaId);
  if (!idea) return;
  const findingId = idea.researchFindingId;
  const snapshot = { ...idea };

  removeIdeasGlobally([ideaId]);
  if (findingId) dismissInStore(findingId);

  showToast("Idea skipped", {
    action: {
      label: "Undo",
      onClick: () => {
        addGlobalIdeas([snapshot]);
        if (findingId) restoreFinding(findingId);
      },
    },
  });
}

// ── Execution ─────────────────────────────────────────────────────────────

/**
 * Adopt a conversation-less idea into a chat and start drafting from it.
 *
 * The finding also lands as a browsable Source, exactly as a repurposed top
 * post does, so the provenance of the draft stays inspectable in the Sources
 * panel. addReadySource dedupes by id, so writing the same idea twice is safe.
 */
export function adoptAndDraft(sessionId, ideaId) {
  const idea = getIdeaById(ideaId);
  if (!sessionId || !idea) return;
  const finding = idea.researchFindingId ? getFinding(idea.researchFindingId) : null;
  const source = finding ? findResearchSource(finding.sourceId) : null;

  // Echo the idea as the object the user acted on — the generic selection-echo
  // turn, so no new turn type is needed.
  postSelectionEcho(sessionId, {
    icon: "ap-icon-sparkles",
    title: idea.title,
    meta: source ? `From research · ${source.name}` : "From research",
  });

  if (finding) {
    addReadySource(sessionId, {
      id: `src-research-${finding.id}`,
      filename: truncate(finding.headline, 60),
      kind: "Research",
      preview: source?.name || "Research",
      iconClass: source?.icon || "ap-icon-feature-listening",
      researchFinding: finding,
    });
    markUsed(finding.id, { sessionId });
  }

  const adopted = adoptIdea(sessionId, ideaId);
  if (!adopted) return;
  startDraftFlow(sessionId, adopted.id);
}

// ── Scanning + announcing ─────────────────────────────────────────────────

/**
 * Run a scan and announce whatever it delivers: a toast, and a card in the
 * chat the user is most likely looking at.
 *
 * Announcing lives here, not in the store — no store in this codebase touches
 * the DOM, and both triggers (the header button and the recurring boot scan)
 * need identical behaviour.
 *
 * @param {object} opts
 * @param {string} opts.contextId
 * @param {boolean} [opts.manual]   the user asked; a manual scan always toasts
 * @param {function} [opts.onDone]  extra callback for the caller's own UI
 */
export function runScanAndAnnounce({ contextId, manual = false, onDone = null } = {}) {
  if (!contextId) return false;
  const { notify } = getResearchConfig(contextId);

  return runScan({
    contextId,
    manual,
    onDone: (delivered) => {
      onDone?.(delivered);
      if (!delivered.length) {
        // Only say "nothing new" when the user asked. An automatic scan that
        // found nothing should stay silent.
        if (manual) showToast("Nothing new since the last scan");
        return;
      }

      announceInChat(contextId, delivered);

      // The feed IS the notification when you're already looking at it. And a
      // Playbook with notifications off still gets the sidebar badge — the
      // preference is about interruption, not about hiding the count.
      if (!notify && !manual) return;
      if (getPath() === "/research") return;

      const n = delivered.length;
      showToast(`${n} new research ${n === 1 ? "finding" : "findings"}`, {
        duration: 6000,
        action: { label: "Open", onClick: () => navigate("/research") },
      });
    },
  });
}

/**
 * Put the batch in front of the user where they already are. Targets the chat
 * they're in, else the most recent one on this Playbook, else the most recent
 * chat at all — never fans out, or the same card lands in six threads.
 */
function announceInChat(contextId, delivered) {
  const sessionId = targetSession(contextId);
  if (!sessionId) return;

  const sourceNames = [...new Set(delivered.map((f) => findResearchSource(f.sourceId)?.name).filter(Boolean))];
  const n = delivered.length;
  const strongest = delivered[0];

  // First person, concrete, no exclamation — this line is the actual point of
  // announcing in chat rather than only badging the nav.
  postAssistantMessage(
    sessionId,
    `I looked through your sources. ${n} new ${n === 1 ? "idea" : "ideas"} — the strongest one is because ${lowerFirst(strongest.headline)}.`,
  );
  postResearchDelivery(sessionId, { findingIds: delivered.map((f) => f.id), sourceNames });
}

function targetSession(contextId) {
  const open = /^\/session\/([^/?]+)/.exec(getPath());
  if (open) return open[1];
  const sessions = getSessions();
  return sessions.find((s) => s.contextId === contextId)?.id || sessions[0]?.id || null;
}

// "Your competitors stopped…" → "your competitors stopped…" so the headline
// reads as a clause inside Archie's sentence. Leaves acronyms and quoted
// openings alone.
function lowerFirst(text) {
  const s = String(text || "");
  if (!s) return s;
  if (s.slice(0, 2) === s.slice(0, 2).toUpperCase() && /[A-Z]{2}/.test(s.slice(0, 2))) return s;
  return s[0].toLowerCase() + s.slice(1);
}

// ── The recurring part ────────────────────────────────────────────────────

// A one-shot scan a few seconds after boot. This is what makes the feature
// FEEL recurring: the badge increments and a toast lands while the user is
// doing something else, which is the whole product claim.
//
// The cadence (daily / weekly / monthly) is NOT a timer — none of those would
// ever fire inside a demo session. It drives copy and how much one scan
// yields. Do not turn this into a setInterval.
const BOOT_SCAN_MS = 12000;
let bootScanScheduled = false;

/**
 * Arm the recurring scan. Called once from app.js's boot block — never from a
 * route render, or navigating would stack scans.
 */
export function initResearch({ contextId } = {}) {
  if (bootScanScheduled || !contextId) return;
  bootScanScheduled = true;
  // Nothing to announce into if there are no chats yet — a first-time user is
  // still being onboarded.
  if (getSessions().length === 0) return;
  window.setTimeout(() => runScanAndAnnounce({ contextId, manual: false }), BOOT_SCAN_MS);
}
