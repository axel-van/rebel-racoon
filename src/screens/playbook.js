// Playbook detail — view + per-section edit of a saved Playbook (Context),
// reusing the shared playbook-view engine in "library" mode. Reached from
// the /contexts cards. Runs inside the app shell (no onboarding chrome).
//
// Header actions:
//   • Start a chat          — primary, opens a new chat bound to this Playbook
//   • Auto-fill ▾           — re-run an analysis to refill every section from
//                             the website / a document / selected social
//                             profiles (overwrite, with confirmation)
//   • ⋯ More                — Set as default · Delete (with confirmation)
//   • Edit                  — inline per-section pencils + title rename
//
// The auto-fill flow reuses the engine's staged loader: we re-mount with a
// `loader` cfg, run the (mock) analysis on a timer, then `updateContext` with
// the section patch — the loader flips to ready and paints the fresh data.

import { navigate } from "../router.js?v=30";
import { escapeHtml as esc } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=99";
import { getContextById, getContexts, updateContext, deleteContext } from "../contexts-store.js?v=29";
import { mount, snapshotEditable } from "../playbook-view.js?v=12";
import { open as openRenameModal } from "../components/rename-modal.js?v=2";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=22";
import { open as openAnalyzeProfilesModal } from "../components/analyze-profiles-modal.js?v=2";
import { analyzeWebsite, analyzeDocument, analyzeSocialProfiles } from "../context-mock-analysis.js?v=22";
import { sectionPatchFromAnalysis } from "../context-builder.js?v=82";

const DOC_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.rtf,.pptx,.csv";
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
  import("../components/toast.js?v=20").then(({ showToast }) => showToast(msg));
}

function prettyUrl(url) {
  return (url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// One dropdown menu item, matching the DS .ap-action-dropdown markup.
function menuItem(attr, icon, label, { danger = false } = {}) {
  return `
    <button type="button" role="menuitem" class="ap-action-dropdown-item ${danger ? "red-mode" : ""}" ${attr}>
      <i class="${icon}"></i>
      <div class="ap-action-dropdown-item-text">
        <div class="ap-action-dropdown-item-label-container">
          <span class="ap-action-dropdown-item-label">${esc(label)}</span>
        </div>
      </div>
    </button>`;
}

function buildHeaderActions(ctx) {
  const hasSite = Boolean((ctx && ctx.websiteUrl) || "");
  const isDefault = Boolean(ctx && ctx.isDefault);

  const fillItems = [
    hasSite ? menuItem("data-fill-website", "ap-icon-web", "Re-analyze website") : "",
    menuItem("data-fill-documents", "ap-icon-file--text", "Fill from documents…"),
    menuItem("data-fill-social", "ap-icon-multiple-users", "Analyze social profiles…"),
  ].join("");

  const moreItems = [
    isDefault ? "" : menuItem("data-set-default", "ap-icon-star", "Set as default"),
    isDefault ? "" : `<div class="ap-action-dropdown-divider" role="separator"></div>`,
    menuItem("data-playbook-delete", "ap-icon-trash", "Delete", { danger: true }),
  ].join("");

  return `
    <button type="button" class="ap-button primary orange" data-playbook-start>
      <i class="ap-icon-sparkles"></i>
      <span>Start a chat</span>
    </button>
    <div class="recap__menu">
      <button type="button" class="ap-button stroked blue recap__menu-toggle" data-menu-toggle="fill" aria-haspopup="menu" aria-expanded="false">
        <i class="ap-icon-refresh"></i>
        <span>Auto-fill</span>
        <i class="ap-icon-chevron-down recap__menu-caret" aria-hidden="true"></i>
      </button>
      <div class="ap-action-dropdown recap__menu-pop" role="menu" data-menu-pop="fill" hidden>${fillItems}</div>
    </div>
    <div class="recap__menu">
      <button type="button" class="ap-icon-button stroked grey recap__menu-toggle" data-menu-toggle="more" aria-haspopup="menu" aria-expanded="false" aria-label="More actions">
        <i class="ap-icon-more"></i>
      </button>
      <div class="ap-action-dropdown recap__menu-pop recap__menu-pop--right" role="menu" data-menu-pop="more" hidden>${moreItems}</div>
    </div>
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
      headerActions: () => buildHeaderActions(getContextById(id)),
      onEditName,
      onFooter,
    };
  }
  function remount() {
    cleanup?.();
    cleanup = mount(target, buildCfg());
  }

  // ── Auto-fill (overwrite + loader) ──────────────────────────────────
  function runAutofill(stages, analysisFn) {
    analyzing = true;
    analysisReady = false;
    analysisLoader = stages;
    remount(); // shows the staged loader
    window.setTimeout(() => {
      const analysis = analysisFn();
      updateContext(id, { ...sectionPatchFromAnalysis(analysis), updatedAt: "just now" });
      analysisReady = true; // loader flips to ready and paints the fresh data
      toast("Playbook sections updated.");
    }, AUTOFILL_MS);
  }

  function setDefault() {
    const prev = getContexts().find((c) => c.isDefault);
    if (prev && prev.id !== id) updateContext(prev.id, { isDefault: false });
    updateContext(id, { isDefault: true, updatedAt: "just now" });
    remount();
    toast("Set as default Playbook.");
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

  // Hidden file input for "Fill from documents…".
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = DOC_ACCEPT;
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    openConfirmModal({
      title: "Fill from document?",
      body: `Every section will be rebuilt from “${esc(file.name)}”, replacing the current content.`,
      confirmLabel: "Fill from document",
      cancelLabel: "Cancel",
      onConfirm: () => runAutofill(STAGES.documents, () => analyzeDocument(file)),
    });
  });
  document.body.appendChild(fileInput);

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
        onConfirm: () => runAutofill(STAGES.website, () => analyzeWebsite(getContextById(id)?.websiteUrl)),
      });
      return true;
    }

    if (event.target.closest("[data-fill-documents]")) {
      closeMenus();
      fileInput.click();
      return true;
    }

    if (event.target.closest("[data-fill-social]")) {
      closeMenus();
      openAnalyzeProfilesModal({
        onConfirm: (ids) => runAutofill(STAGES.social, () => analyzeSocialProfiles(ids)),
      });
      return true;
    }

    if (event.target.closest("[data-set-default]")) {
      closeMenus();
      setDefault();
      return true;
    }

    if (event.target.closest("[data-playbook-delete]")) {
      closeMenus();
      confirmDelete();
      return true;
    }

    // Any other click inside the content closes open menus.
    closeMenus();
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
    fileInput.remove();
    cleanup?.();
  };
}
