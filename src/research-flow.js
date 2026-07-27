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
import { navigate } from "./router.js?v=30";
import { showToast } from "./components/toast.js?v=20";
import { open as openChatPicker } from "./components/chat-picker-modal.js?v=58";
import { getSessions } from "./sessions-store.js?v=8";
import { getFinding, markUsed, dismissFinding as dismissInStore, restoreFinding } from "./research-store.js?v=2";
import { findResearchSource } from "./research-catalog.js?v=2";
import { postSelectionEcho, postExtractionResult, startPending, finishPending } from "./assistant.js?v=60";
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
