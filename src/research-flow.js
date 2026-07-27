// Research flow — turning a finding into Ideas.
//
// A finding sits upstream of Ideas: Source → Finding → Idea → Draft →
// Schedule. Accepting one injects its pre-authored idea seeds into a chat's
// library, stamped with the finding as their source, so the existing draft
// pipeline takes over from there unchanged.
//
// The flow lives here rather than in the screen because THREE surfaces call the
// same entry points: the /research feed card, the "Read the research" modal
// footer, and (next) the in-chat delivery turn.
//
//   useFinding(id, { sessionId, forcePicker, thenDraft })
//   dismiss(id)                          — with an Undo toast
//   executeUseFinding(sessionId, id, { thenDraft })
//
// WHICH CHAT? /research has no session at all, so when none is supplied the
// chat-picker modal asks — the same modal, and the same
// "no chats yet → mint one" shortcut, that the idea → draft path already uses.
// The pick is carried across the navigation by a single-use handoff, consumed
// at session mount (screens/session.js).

import { setHandoff } from "./handoff.js?v=20";
import { navigate, getPath } from "./router.js?v=30";
import { showToast } from "./components/toast.js?v=20";
import { open as openChatPicker } from "./components/chat-picker-modal.js?v=58";
import { getSessions } from "./sessions-store.js?v=8";
import {
  getFinding,
  markUsed,
  dismissFinding as dismissInStore,
  restoreFinding,
  getResearchConfig,
  runScan,
} from "./research-store.js?v=2";
import { findResearchSource } from "./research-catalog.js?v=2";
import {
  postSelectionEcho,
  postExtractionResult,
  postAssistantMessage,
  postResearchDelivery,
  startPending,
  finishPending,
} from "./assistant.js?v=60";
import { addReadySource } from "./sources-stream.js?v=53";
import { injectIdeasForSource } from "./library.js?v=50";
import { startDraftFlow } from "./draft-flow.js?v=54";

export const HANDOFF_KEY = "pendingResearchUse";

// Long enough to read as work, short enough not to stall a demo. Shorter than
// the draft flow's 6s — this is a translation, not a generation.
const USE_DELAY_MS = 2200;

// A source row's filename is a one-line label; a finding's headline is a
// sentence. Trim it rather than letting it dominate the Sources panel.
function truncate(text, max) {
  const s = String(text || "");
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

// ── Entry points ──────────────────────────────────────────────────────────

/**
 * Turn a finding into ideas.
 *
 * @param {string} findingId
 * @param {object} [opts]
 * @param {string|null} [opts.sessionId]  the chat to use; null → ask
 * @param {boolean} [opts.forcePicker]    ask even when a session is known
 *   (the split button's "Turn into ideas in…" — the only way to target
 *   another chat from inside one)
 * @param {boolean} [opts.thenDraft]      chain straight into the draft flow
 */
export function useFinding(findingId, { sessionId = null, forcePicker = false, thenDraft = false } = {}) {
  if (!getFinding(findingId)) return;

  if (sessionId && !forcePicker) {
    executeUseFinding(sessionId, findingId, { thenDraft });
    return;
  }

  const go = (targetId) => {
    setHandoff(HANDOFF_KEY, { findingId, thenDraft });
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

/** Reject a finding. Remembered by dedupeKey, so no later scan re-proposes it. */
export function dismiss(findingId) {
  if (!dismissInStore(findingId)) return;
  showToast("Finding dismissed", {
    action: { label: "Undo", onClick: () => restoreFinding(findingId) },
  });
}

// ── Execution ─────────────────────────────────────────────────────────────

/**
 * The actual work, inside a chat. Echo what was picked, run the pending chip,
 * register the finding as a browsable Source, inject its ideas, announce them.
 */
export function executeUseFinding(sessionId, findingId, { thenDraft = false } = {}) {
  const finding = getFinding(findingId);
  if (!sessionId || !finding) return;
  const source = findResearchSource(finding.sourceId);

  // The finding, echoed as the object the user acted on — the generic
  // selection-echo turn, so no new turn type is needed.
  postSelectionEcho(sessionId, {
    icon: source?.icon || "ap-icon-feature-listening",
    title: finding.headline,
    meta: [source?.name, finding.researchType].filter(Boolean).join(" · "),
  });

  // Same lifecycle as draft-flow's withPendingChip: chip → wait → clear → work,
  // with a retry toast if the work throws so the chip never ticks forever.
  const pendingId = startPending(sessionId, "Turning research into ideas");
  setTimeout(() => {
    finishPending(sessionId, pendingId);
    try {
      commit(sessionId, finding, source, { thenDraft });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("research-flow: turning a finding into ideas failed", err);
      showToast("Couldn't turn that into ideas. Try again?", {
        variant: "error",
        duration: 6000,
        action: { label: "Retry", onClick: () => executeUseFinding(sessionId, findingId, { thenDraft }) },
      });
    }
  }, USE_DELAY_MS);
}

function commit(sessionId, finding, source, { thenDraft }) {
  // The finding becomes a browsable Source, exactly as a repurposed top post
  // does — so the provenance of every idea below is inspectable in the Sources
  // panel. addReadySource dedupes by id, so re-using a finding is idempotent.
  const sourceId = addReadySource(sessionId, {
    id: `src-research-${finding.id}`,
    filename: truncate(finding.headline, 60),
    kind: "Research",
    preview: [source?.name, finding.scannedAt].filter(Boolean).join(" · "),
    iconClass: source?.icon || "ap-icon-feature-listening",
    researchFinding: finding,
  });

  // Pre-authored seeds, not generated — they read as genuinely derived from
  // THIS finding. researchFindingId ties each idea back to it (whitelisted in
  // injectIdeasForSource's mapper).
  const created = injectIdeasForSource(
    sessionId,
    sourceId,
    (finding.ideaSeeds || []).map((s) => ({ ...s, researchFindingId: finding.id })),
  );

  // The canonical "Extracted N ideas" turn, with the inline idea cards.
  postExtractionResult(sessionId, { filename: source?.name || "Research", ideas: created });

  markUsed(finding.id, { sessionId });

  if (thenDraft && created.length) startDraftFlow(sessionId, created[0].id);
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
    `I scanned your research sources. ${n} new ${n === 1 ? "finding" : "findings"} — the strongest one is about ${lowerFirst(strongest.headline)}.`,
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
