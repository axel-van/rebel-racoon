// Playbook detail — view + per-section edit of a saved Playbook (Context),
// reusing the shared playbook-view engine in "library" mode. Reached from
// the /contexts cards. Runs inside the app shell (no onboarding chrome).
//
// Header actions:
//   • Start a chat          — primary, opens a new chat bound to this Playbook
//   • Re-analyze website    — rebuilds every section from the site (confirmation)
//   • Delete                — remove the Playbook (with confirmation)
//   • Edit                  — inline per-section pencils + title rename
//   • ★ (next to the name)  — toggle this Playbook as the default
//
// Voice-only re-analysis:
//   • Learn from…           — Voice & style section dropdown (my posts / docs),
//                             scoped to the voice fields only
//
// Each re-analysis reuses the engine's staged loader: we re-mount with a
// `loader` cfg, run the (mock) analysis on a timer, then `updateContext` with
// the section patch — the loader flips to ready and paints the fresh data.

import { navigate } from "../router.js?v=1227";
import { escapeHtml as esc } from "../utils.js?v=1227";
import { renderTopbar } from "../components/topbar.js?v=1227";
import {
  getContextById,
  getContexts,
  updateContext,
  deleteContext,
  duplicateContext,
  appendHistory,
} from "../contexts-store.js?v=1227";
import { isWorkspaceMode, setActivePlaybook, catalogueRoute } from "../active-playbook.js?v=1227";
import { mount, snapshotEditable } from "../playbook-view.js?v=1227";
import { open as openRenameModal } from "../components/rename-modal.js?v=1227";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=1227";
import { open as openAnalyzeProfilesModal } from "../components/analyze-profiles-modal.js?v=1227";
import { open as openFillDocumentModal } from "../components/fill-document-modal.js?v=1227";
import { analyzeWebsite, analyzeDocument, analyzeSocialProfiles } from "../context-mock-analysis.js?v=1227";
import { sectionPatchFromAnalysis } from "../context-builder.js?v=1227";
import {
  canView,
  canEdit,
  canGovern,
  isOrgShared,
  canDelete,
  canManageSharing,
  accessLabel,
  isMine,
  ownerOf,
  ownerName,
} from "../playbook-access.js?v=1227";
import { open as openShareModal } from "../components/share-playbook-modal.js?v=1227";

const AUTOFILL_MS = 1500;

const STAGES = {
  website: [
    { title: "Reading the website", sub: "Scanning pages, copy, and brand cues." },
    { title: "Rebuilding your Playbook", sub: "Mapping it all into every section." },
  ],
  documents: [
    { title: "Reading your document", sub: "Pulling voice, format, and brand cues." },
    { title: "Rebuilding your Playbook", sub: "Mapping it all into every section." },
  ],
  social: [
    { title: "Reading your posts", sub: "Learning how you open, close, and format." },
    { title: "Rebuilding your Playbook", sub: "Mapping it all into every section." },
  ],
};

function toast(msg) {
  import("../components/toast.js?v=1227").then(({ showToast }) => showToast(msg));
}

function prettyUrl(url) {
  return (url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// "Re-analyze website" rebuilds every section from the site, so it's a
// Playbook-wide action and lives in the header (a labelled stroked button — no
// dropdown now that it's the only whole-Playbook source). Voice sources live in
// the Voice & style "Learn from…" dropdown.
function buildHeaderActions(ctx) {
  // Using a Playbook is always on the table — that's what being shared one is
  // for. Everything that WRITES depends on owning it (or managing the org).
  // Duplicate is the recipient's real action: it turns reading into having.
  const editable = canEdit(ctx);
  return [
    `<button type="button" class="ap-button primary blue" data-playbook-start>
      <i class="ap-icon-double-chat-bubbles"></i>
      <span>Start a chat</span>
    </button>`,
    !editable
      ? `<button type="button" class="ap-button stroked blue" data-playbook-duplicate>
          <i class="ap-icon-copy"></i>
          <span>Duplicate</span>
        </button>`
      : "",
    canManageSharing(ctx)
      ? `<button type="button" class="ap-button stroked blue" data-playbook-share>
          <i class="ap-icon-share"></i>
          <span>Share</span>
        </button>`
      : "",
    editable
      ? `<button type="button" class="ap-button stroked blue" data-fill-website>
          <i class="ap-icon-refresh"></i>
          <span>Re-analyze website</span>
        </button>`
      : "",
    canDelete(ctx)
      ? `<button type="button" class="ap-icon-button stroked grey" data-playbook-delete title="Delete" aria-label="Delete Playbook">
          <i class="ap-icon-trash"></i>
        </button>`
      : "",
  ].join("");
}

// What playbook-view is allowed to say about ownership: a mark beside the name
// and one quick fact in the rail. Nothing becomes a section.
function buildOwnership(ctx) {
  const tag = accessLabel(ctx);
  if (!tag) return null;
  const owner = ownerOf(ctx);
  return {
    tag,
    owner: owner ? `${owner.name}${isMine(ctx) ? " (you)" : ""}` : ownerName(ctx),
    initials: owner?.initials || "?",
  };
}

// Say WHY the pencils are gone. Removing them silently reads as a broken page;
// naming the owner and offering the way out (Duplicate) reads as a rule.
//
// A manager lands here too, now that governing a fiche and writing it are
// separate rights: they hold Share / hand-over / Delete in the header and no
// pencil in the body. Telling them only "duplicate it" would read as the page
// being broken, so the notice names both halves.
function buildNotice(ctx) {
  if (canEdit(ctx) || !accessLabel(ctx)) return "";
  // Whichever way it reached me — the whole org, or my name on a list — the
  // headline says which, because they are not the same promise: one follows the
  // org, the other is a list its owner wrote by hand.
  const headline = isOrgShared(ctx)
    ? `${esc(ownerName(ctx))} shares this Playbook with your organisation`
    : `${esc(ownerName(ctx))} shared this Playbook with you`;
  const message = canGovern(ctx)
    ? `You can read it and write with it, and manage it as a manager — share it, hand it over, delete it. What it SAYS is ${esc(ownerName(ctx))}'s: to change a word, duplicate it.`
    : "You can read it and write with it. To change anything, duplicate it — the copy is yours.";
  return `
    <div class="ap-infobox info recap__notice">
      <i class="ap-icon-info" aria-hidden="true"></i>
      <div class="ap-infobox-content">
        <div class="ap-infobox-texts">
          <span class="ap-infobox-title">${headline}</span>
          <span class="ap-infobox-message">${message}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderPlaybook(params, target) {
  const id = params.id;
  renderTopbar();

  const guard = getContextById(id);
  // A Playbook that isn't mine and isn't shared is not a 404 — it exists, I
  // just can't be here. Same exit either way.
  if (!guard || !canView(guard)) {
    navigate(catalogueRoute());
    return () => {};
  }

  let cleanup = null;
  // Auto-fill loader state (drives the engine's staged loader on re-analysis).
  let analyzing = false;
  let analysisReady = false;
  let analysisLoader = null;

  // Every write to this Playbook goes through here on its way: one log line,
  // and — when it isn't mine — the notification its owner is owed (doc §6.4).
  function note(ctx, action) {
    if (!ctx) return;
    appendHistory(ctx.id, action);
    if (!isMine(ctx)) toast(`${ownerName(ctx)} will be notified.`);
  }

  // ── Menus ──────────────────────────────────────────────────────────
  function closeMenus() {
    target.querySelectorAll("[data-menu-pop]").forEach((p) => (p.hidden = true));
    target.querySelectorAll("[data-menu-toggle]").forEach((t) => t.setAttribute("aria-expanded", "false"));
  }

  // ── Re-mount (reflect external updates + enter/exit the loader) ─────
  function buildCfg() {
    return {
      mode: "library",
      getData: () => getContextById(id),
      isReady: () => !analyzing || analysisReady,
      loader: analyzing ? analysisLoader : null,
      skipLoader: !analyzing,
      onIntroDone: () => {
        analyzing = false;
      },
      commit: () => {
        const ctx = getContextById(id);
        if (!ctx) return;
        note(ctx, "edited this Playbook");
        updateContext(id, { ...snapshotEditable(ctx), updatedAt: "just now" });
      },
      revert: (snapshot) => updateContext(id, snapshot),
      showTop: false,
      canEdit: canEdit(getContextById(id)),
      ownership: buildOwnership(getContextById(id)),
      notice: () => buildNotice(getContextById(id)),
      headerActions: () => buildHeaderActions(getContextById(id)),
      // The rename pencil and the voice re-analysis are both writes: withhold
      // the callback and playbook-view renders no affordance.
      onEditName: canEdit(getContextById(id)) ? onEditName : undefined,
      onAnalyzeVoice: canEdit(getContextById(id)) ? onAnalyzeVoice : undefined,
      onFooter,
    };
  }
  function remount() {
    cleanup?.();
    cleanup = mount(target, buildCfg());
  }

  // ── Auto-fill (overwrite + loader) ──────────────────────────────────
  // patchFn() returns the field patch to apply once the (mock) analysis lands.
  function runAutofill(stages, patchFn, message = "Playbook sections updated.") {
    analyzing = true;
    analysisReady = false;
    analysisLoader = stages;
    remount(); // shows the staged loader
    window.setTimeout(() => {
      updateContext(id, { ...patchFn(), updatedAt: "just now" });
      analysisReady = true; // loader flips to ready and paints the fresh data
      toast(message);
    }, AUTOFILL_MS);
  }

  // "Analyze social profiles" only rewrites Voice & style (the guided fields),
  // so it lives on that section — not the whole-Playbook Auto-fill menu.
  function voicePatchFromAnalysis(analysis) {
    const p = sectionPatchFromAnalysis(analysis);
    return {
      signatureHooks: p.signatureHooks,
      closingPatterns: p.closingPatterns,
      formattingStyle: p.formattingStyle,
      visualStyle: p.visualStyle,
      voiceMode: "guided",
      voiceManual: "",
    };
  }
  function onAnalyzeVoice() {
    openAnalyzeProfilesModal({
      onConfirm: (ids) =>
        runAutofill(STAGES.social, () => voicePatchFromAnalysis(analyzeSocialProfiles(ids)), "Voice & style updated."),
    });
  }

  function confirmDelete() {
    const ctx = getContextById(id);
    // Guard: every chat needs a Playbook, so never delete the last one.
    if (getContexts().length <= 1) {
      toast("Can't delete the last Playbook — every chat needs one.");
      return;
    }
    const shared = ctx?.scope === "organization";
    const n = ctx?.usedIn || 0;
    const body = shared
      ? `“${esc(ctx?.name || "This Playbook")}” is shared with your organisation${
          n ? ` and ${n === 1 ? "1 chat runs" : `${n} chats run`} on it` : ""
        }. Those chats keep the drafts already written — they can still be saved or scheduled — but they won’t generate anything new. This can’t be undone.`
      : `“${esc(ctx?.name || "This Playbook")}” will be removed. Chats using it will need a new Playbook. This can’t be undone.`;
    openConfirmModal({
      title: "Delete Playbook?",
      body,
      confirmLabel: "Delete Playbook",
      cancelLabel: "Keep",
      danger: true,
      onConfirm: () => {
        if (ctx && !isMine(ctx)) toast(`${ownerName(ctx)} will be notified.`);
        deleteContext(id);
        toast("Playbook deleted");
        navigate(catalogueRoute());
      },
    });
  }

  // "Learn from → Documents…" — a modal with a file dropzone + a document link
  // (Google Docs / Drive). Scoped to Voice & style (same as "My posts"), so it
  // only rewrites the guided voice fields, never the whole Playbook.
  function docNameFromUrl(url) {
    if (/docs\.google/.test(url)) return "Google Doc";
    if (/drive\.google/.test(url)) return "Drive file";
    try {
      return new URL(url).hostname.replace(/^www\./, "") || "Linked document";
    } catch {
      return "Linked document";
    }
  }
  function learnVoiceFromDocument() {
    openFillDocumentModal({
      onConfirm: ({ file, url }) => {
        const fileLike = file || { name: docNameFromUrl(url) };
        runAutofill(
          STAGES.documents,
          () => voicePatchFromAnalysis(analyzeDocument(fileLike)),
          "Voice & style updated.",
        );
      },
    });
  }

  // Header name pencil → rename the Playbook.
  const onEditName = () => {
    const ctx = getContextById(id);
    openRenameModal({
      title: "Rename Playbook",
      initialName: ctx?.name || "",
      placeholder: "Playbook name",
      confirmLabel: "Save name",
      onSubmit: (name) => {
        note(ctx, "renamed this Playbook");
        updateContext(id, { name, updatedAt: "just now" });
        remount();
      },
    });
  };

  const onFooter = (event) => {
    // Menu open/close.
    const toggle = event.target.closest("[data-menu-toggle]");
    if (toggle) {
      const which = toggle.dataset.menuToggle;
      const pop = target.querySelector(`[data-menu-pop="${which}"]`);
      const willOpen = pop && pop.hidden;
      closeMenus();
      if (willOpen) {
        pop.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
      }
      return true;
    }

    if (event.target.closest("[data-playbook-start]")) {
      closeMenus();
      // In workspace mode, starting a chat from a fiche is also the shortest
      // way to change brand — the chat would otherwise belong to a Playbook the
      // rail says you are not in, and the two would contradict each other on
      // screen. So the switch happens first; the `?contextId=` then merely
      // restates it.
      if (isWorkspaceMode()) setActivePlaybook(id);
      navigate(`/session/new-${Date.now().toString(36)}?contextId=${id}`);
      return true;
    }

    if (event.target.closest("[data-playbook-share]")) {
      closeMenus();
      openShareModal({
        contextId: id,
        // Handing a private Playbook to somebody else revokes my own access —
        // so re-check rather than repaint blindly, and leave if I'm no longer
        // allowed to be here.
        onDone: () => {
          const ctx = getContextById(id);
          if (!ctx || !canView(ctx)) navigate(catalogueRoute());
          else remount();
        },
      });
      return true;
    }

    if (event.target.closest("[data-playbook-duplicate]")) {
      closeMenus();
      const copy = duplicateContext(id);
      if (copy) {
        toast("Duplicated — this copy is yours to edit.");
        navigate(`/playbook/${copy.id}`);
      }
      return true;
    }

    if (event.target.closest("[data-fill-website]")) {
      closeMenus();
      const ctx = getContextById(id);
      const domain = prettyUrl(ctx?.websiteUrl) || "the website";
      openConfirmModal({
        title: "Re-analyze website?",
        body: `Every section will be rebuilt from ${esc(domain)}, replacing the current content.`,
        confirmLabel: "Re-analyze",
        cancelLabel: "Cancel",
        onConfirm: () =>
          runAutofill(STAGES.website, () => sectionPatchFromAnalysis(analyzeWebsite(getContextById(id)?.websiteUrl))),
      });
      return true;
    }

    // Voice & style "Learn from…" dropdown — both sources are voice-scoped.
    const learn = event.target.closest("[data-recap-learn]");
    if (learn) {
      learn.closest("details")?.removeAttribute("open");
      if (learn.dataset.recapLearn === "posts") onAnalyzeVoice();
      else if (learn.dataset.recapLearn === "documents") learnVoiceFromDocument();
      return true;
    }

    if (event.target.closest("[data-playbook-delete]")) {
      closeMenus();
      confirmDelete();
      return true;
    }

    // Any other click inside the content closes open menus + any open
    // <details> dropdown the click landed outside of (audience picker /
    // "Learn from…" menu — both drive their own native open state).
    closeMenus();
    target.querySelectorAll("[data-recap-audience-details][open], [data-recap-learn-menu][open]").forEach((d) => {
      if (!d.contains(event.target)) d.removeAttribute("open");
    });
    return false;
  };

  // Clicks outside the content area (sidebar / topbar) also close the menus.
  const onDocClick = (event) => {
    if (!target.contains(event.target)) closeMenus();
  };
  document.addEventListener("click", onDocClick);

  cleanup = mount(target, buildCfg());

  return () => {
    document.removeEventListener("click", onDocClick);
    cleanup?.();
  };
}
