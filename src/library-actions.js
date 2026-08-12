// Library actions — shared bulk-bar renderers + click-handler wiring used
// by both the dashboard's Content panel and the in-session Content tab.
//
// The two surfaces want feature parity (FIND-LIB1): same checkboxes, same
// sticky bars, same Extract / Delete behaviour, same per-row "…" menu.
// Rather than duplicate the dispatch in each screen, both call
// `wireLibraryActions(root, options)` which attaches a single delegated
// click listener that handles every library-related data-* hook.
//
// Public API:
//   renderSourcesBulkBar(count) → HTML
//   renderIdeasBulkBar(count)   → HTML
//   wireLibraryActions(root, options)
//
// `options`:
//   sessionId         string  — id of the session that owns the per-session
//                               ideas list (the dashboard passes the default
//                               session id; the session screen passes its own).
//   sourceSelection   Set     — module-local selection Set, mutated in place.
//   ideaSelection     Set     — same, for ideas.
//   getSources()              — returns the live source list (lets us filter
//                               processing rows out of bulk-extract calls).
//   onRerender()              — caller-owned re-render entry point. Library
//                               mutations + selection toggles call this so
//                               the workspace repaints with the latest state.
//   signal            AbortSignal — passed to addEventListener so callers can
//                               replace handlers cleanly across re-renders.
//
// All bulk operations route through library.js / sources-stream.js so the
// underlying state stays in one place. The user-facing toast is fired here
// (a single shared place for the wording).

import { appendExtractedIdeas, removeIdeasForSources, removeIdeas, getIdeas } from "./library.js?v=86";
import { removeSources as streamRemoveSources, getSources as streamGetSources } from "./sources-stream.js?v=84";
import { open as openConfirmModal } from "./components/confirm-modal.js?v=22";
import { showToast } from "./components/toast.js?v=21";
import { addMention } from "./composer-mentions.js?v=60";

// ── Bulk-bar HTML renderers ──────────────────────────────────────────────

export function renderSourcesBulkBar(count) {
  const noun = count === 1 ? "source" : "sources";
  return `
    <div class="content-workspace__bulk-bar" role="region" aria-label="Bulk source actions">
      <span class="content-workspace__bulk-count">${count} ${noun} selected</span>
      <div class="content-workspace__bulk-actions">
        <button type="button" class="ap-button stroked blue" data-bulk-extract>
          <i class="ap-icon-archie-official"></i>
          <span>Extract more ideas</span>
        </button>
        <button type="button" class="ap-button stroked danger" data-bulk-delete>
          <i class="ap-icon-trash"></i>
          <span>Delete</span>
        </button>
        <button type="button" class="ap-button transparent grey" data-bulk-cancel>Cancel</button>
      </div>
    </div>
  `;
}

export function renderIdeasBulkBar(count) {
  const noun = count === 1 ? "idea" : "ideas";
  return `
    <div class="content-workspace__bulk-bar" role="region" aria-label="Bulk idea actions">
      <span class="content-workspace__bulk-count">${count} ${noun} selected</span>
      <div class="content-workspace__bulk-actions">
        <button type="button" class="ap-button stroked danger" data-bulk-idea-delete>
          <i class="ap-icon-trash"></i>
          <span>Delete</span>
        </button>
        <button type="button" class="ap-button transparent grey" data-bulk-idea-cancel>Cancel</button>
      </div>
    </div>
  `;
}

// ── Wiring ───────────────────────────────────────────────────────────────

export function wireLibraryActions(root, options) {
  const { sessionId, sourceSelection, ideaSelection, onRerender, signal } = options;
  const getSources = options.getSources || (() => streamGetSources(sessionId));

  root.addEventListener(
    "click",
    (event) => {
      // Per-row "Reference" — source card pushes its filename into the composer.
      // (The right-panel Sources surface wires its own copy; this covers the
      // Library/Content view, whose buttons were previously decorative.)
      const sourceMention = event.target.closest("[data-source-mention]");
      if (sourceMention) {
        const src = getSources().find((s) => s.id === sourceMention.dataset.sourceMention);
        if (sessionId && src) addMention(sessionId, src.filename);
        return;
      }

      // Per-row "Reference" — idea card pushes its title into the composer.
      const ideaMention = event.target.closest("[data-idea-mention]");
      if (ideaMention) {
        const idea = (getIdeas(sessionId) || []).find((i) => i.id === ideaMention.dataset.ideaMention);
        if (sessionId && idea) addMention(sessionId, idea.title);
        return;
      }

      // Source per-row checkbox toggle
      const sourceBox = event.target.closest("[data-source-select]");
      if (sourceBox) {
        const id = sourceBox.dataset.sourceSelect;
        if (sourceBox.checked) sourceSelection.add(id);
        else sourceSelection.delete(id);
        onRerender?.();
        return;
      }

      // Idea per-row checkbox toggle
      const ideaBox = event.target.closest("[data-idea-select]");
      if (ideaBox) {
        const id = ideaBox.dataset.ideaSelect;
        if (ideaBox.checked) ideaSelection.add(id);
        else ideaSelection.delete(id);
        onRerender?.();
        return;
      }

      // Per-row "Extract more ideas" from the source card "…" menu
      const extractOne = event.target.closest("[data-source-extract-one]");
      if (extractOne) {
        const id = extractOne.dataset.sourceExtractOne;
        const target = getSources().find((s) => s.id === id && s.status !== "Processing");
        if (target) {
          // The "N ideas ready" snackbar is fired centrally by
          // postExtractionResult (assistant.js); just repaint here.
          appendExtractedIdeas(sessionId, [target], () => onRerender?.());
        }
        return;
      }

      // Per-row "Delete" from the source card "…" menu
      const deleteOne = event.target.closest("[data-source-delete-one]");
      if (deleteOne) {
        const id = deleteOne.dataset.sourceDeleteOne;
        const target = getSources().find((s) => s.id === id);
        if (!target) return;
        openConfirmModal({
          title: `Delete ${target.filename}?`,
          body: "This removes the file and any ideas that came only from it. Ideas backed by other sources stay.",
          confirmLabel: "Delete source",
          danger: true,
          onConfirm: () => {
            removeIdeasForSources(sessionId, [id]);
            streamRemoveSources([id], sessionId);
            sourceSelection.delete(id);
            onRerender?.();
            showToast(`${target.filename} deleted`);
          },
        });
        return;
      }

      // Sources bulk: Cancel
      if (event.target.closest("[data-bulk-cancel]")) {
        sourceSelection.clear();
        onRerender?.();
        return;
      }

      // Sources bulk: Extract more
      if (event.target.closest("[data-bulk-extract]")) {
        const ids = Array.from(sourceSelection);
        const sources = getSources();
        const targets = sources.filter((s) => ids.includes(s.id) && s.status !== "Processing");
        if (targets.length === 0) {
          showToast("Nothing to extract — selected sources are still processing.");
          return;
        }
        appendExtractedIdeas(sessionId, targets);
        sourceSelection.clear();
        onRerender?.();
        return;
      }

      // Sources bulk: Delete
      if (event.target.closest("[data-bulk-delete]")) {
        const ids = Array.from(sourceSelection);
        if (ids.length === 0) return;
        const noun = ids.length === 1 ? "source" : "sources";
        openConfirmModal({
          title: `Delete ${ids.length} ${noun}?`,
          body: `This removes the file${ids.length === 1 ? "" : "s"} and any ideas that came only from ${ids.length === 1 ? "it" : "them"}. Ideas backed by other sources stay.`,
          confirmLabel: `Delete ${ids.length} ${noun}`,
          danger: true,
          onConfirm: () => {
            removeIdeasForSources(sessionId, ids);
            const removed = streamRemoveSources(ids, sessionId);
            sourceSelection.clear();
            onRerender?.();
            showToast(`${removed} ${removed === 1 ? "source" : "sources"} deleted`);
          },
        });
        return;
      }

      // Ideas bulk: Cancel
      if (event.target.closest("[data-bulk-idea-cancel]")) {
        ideaSelection.clear();
        onRerender?.();
        return;
      }

      // Ideas bulk: Delete
      if (event.target.closest("[data-bulk-idea-delete]")) {
        const ids = Array.from(ideaSelection);
        if (ids.length === 0) return;
        const noun = ids.length === 1 ? "idea" : "ideas";
        openConfirmModal({
          title: `Delete ${ids.length} ${noun}?`,
          body: `This removes the selected idea${ids.length === 1 ? "" : "s"}. The source file${ids.length === 1 ? "" : "s"} stay${ids.length === 1 ? "s" : ""} attached.`,
          confirmLabel: `Delete ${ids.length} ${noun}`,
          danger: true,
          onConfirm: () => {
            const removed = removeIdeas(sessionId, ids);
            ideaSelection.clear();
            onRerender?.();
            showToast(`${removed} ${removed === 1 ? "idea" : "ideas"} deleted`);
          },
        });
        return;
      }
    },
    { signal },
  );
}
