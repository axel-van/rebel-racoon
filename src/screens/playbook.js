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

import { navigate } from "../router.js?v=30";
import { parseHashParams } from "../url-state.js?v=21";
import { escapeHtml as esc } from "../utils.js?v=21";
import { renderTopbar } from "../components/topbar.js?v=395";
import { getContextById, getContexts, updateContext, deleteContext } from "../contexts-store.js?v=72";
import { mount, snapshotEditable } from "../playbook-view.js?v=94";
import { open as openRenameModal } from "../components/rename-modal.js?v=2";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=22";
import { open as openAnalyzeProfilesModal } from "../components/analyze-profiles-modal.js?v=48";
import { open as openFillDocumentModal } from "../components/fill-document-modal.js?v=5";
import { analyzeWebsite, analyzeDocument, analyzeSocialProfiles } from "../context-mock-analysis.js?v=25";
import { sectionPatchFromAnalysis } from "../context-builder.js?v=362";
import { isFlagOn } from "../feature-flags.js?v=20";

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
  import("../components/toast.js?v=21").then(({ showToast }) => showToast(msg));
}

function prettyUrl(url) {
  return (url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// "Re-analyze website" rebuilds every section from the site, so it's a
// Playbook-wide action and lives in the header (a labelled stroked button — no
// dropdown now that it's the only whole-Playbook source). Voice sources live in
// the Voice & style "Learn from…" dropdown.
function buildHeaderActions() {
  return `
    <button type="button" class="ap-button primary blue" data-playbook-start>
      <i class="ap-icon-double-chat-bubbles"></i>
      <span>Start a chat</span>
    </button>
    <button type="button" class="ap-button stroked blue" data-fill-website>
      <i class="ap-icon-refresh"></i>
      <span>Re-analyze website</span>
    </button>
    <button type="button" class="ap-icon-button stroked grey" data-playbook-delete title="Delete" aria-label="Delete Playbook">
      <i class="ap-icon-trash"></i>
    </button>
  `;
}

export function renderPlaybook(params, target) {
  const id = params.id;
  renderTopbar();

  if (!getContextById(id)) {
    navigate("/contexts");
    return () => {};
  }

  let cleanup = null;
  // Auto-fill loader state (drives the engine's staged loader on re-analysis).
  let analyzing = false;
  let analysisReady = false;
  let analysisLoader = null;

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
        if (ctx) updateContext(id, { ...snapshotEditable(ctx), updatedAt: "just now" });
      },
      revert: (snapshot) => updateContext(id, snapshot),
      showTop: false,
      headerActions: () => buildHeaderActions(),
      onEditName,
      // Gated behind the playbookDefault flag (default OFF): without the
      // callback, playbook-view renders no "set as default" star.
      onToggleDefault: isFlagOn("playbookDefault") ? toggleDefault : undefined,
      onAnalyzeVoice,
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

  // Header star → toggle this Playbook as the default. Setting it unsets the
  // previous default; unsetting just clears the flag (getDefaultContext then
  // falls back to the first Playbook).
  function toggleDefault() {
    const ctx = getContextById(id);
    const makeDefault = !ctx?.isDefault;
    if (makeDefault) {
      const prev = getContexts().find((c) => c.isDefault);
      if (prev && prev.id !== id) updateContext(prev.id, { isDefault: false });
    }
    updateContext(id, { isDefault: makeDefault, updatedAt: "just now" });
    remount();
    toast(makeDefault ? "Set as default Playbook." : "No longer the default Playbook.");
  }

  function confirmDelete() {
    const ctx = getContextById(id);
    // Guard: every chat needs a Playbook, so never delete the last one.
    if (getContexts().length <= 1) {
      toast("Can't delete the last Playbook — every chat needs one.");
      return;
    }
    openConfirmModal({
      title: "Delete Playbook?",
      body: `“${esc(ctx?.name || "This Playbook")}” will be removed. Chats using it will need a new Playbook. This can’t be undone.`,
      confirmLabel: "Delete Playbook",
      cancelLabel: "Keep",
      danger: true,
      onConfirm: () => {
        deleteContext(id);
        toast("Playbook deleted");
        navigate("/contexts");
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
      navigate(`/session/new-${Date.now().toString(36)}?contextId=${id}`);
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

  // `?section=<scope>` deep-links to one section. Content Research links here
  // from its read-only competitors/influencers dialog; without this the link
  // landed at the top of the page and left the user to find the section. Run
  // after mount so the target exists, and inside rAF so the panels have been
  // laid out — scrollIntoView against a zero-height element does nothing.
  const sectionScroll = window.requestAnimationFrame(() => {
    const scope = parseHashParams().get("section");
    if (!scope) return;
    // The engine ids its panels `pbk-sec-<scope>`, except goals whose scope and
    // id already agree. A scope naming a hidden or unknown section is ignored
    // rather than scrolling to the top.
    const el = target.querySelector(`#pbk-sec-${scope}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  return () => {
    window.cancelAnimationFrame(sectionScroll);
    document.removeEventListener("click", onDocClick);
    cleanup?.();
  };
}
