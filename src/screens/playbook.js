// Playbook detail — view + per-card edit of a saved Playbook (Context),
// reusing the shared playbook-view engine in "library" mode. Reached from
// the /contexts cards. Runs inside the app shell (no onboarding chrome, no
// loader); edits save straight into the contexts-store, and the footer
// returns to the Playbooks list.

import { navigate } from "../router.js?v=30";
import { escapeHtml as esc } from "../utils.js?v=20";
import { renderTopbar } from "../components/topbar.js?v=99";
import { getContextById, getContexts, updateContext, deleteContext } from "../contexts-store.js?v=29";
import { mount, snapshotEditable } from "../playbook-view.js?v=4";
import { open as openRenameModal } from "../components/rename-modal.js?v=2";
import { open as openConfirmModal } from "../components/confirm-modal.js?v=22";

// Footer action bar buttons — Start a chat (AI spotlight) · Edit name · Delete.
// Rendered in the sticky footer bar (not in the page body).
const FOOTER_ACTIONS = `
  <button type="button" class="ap-button primary orange" data-playbook-start>
    <i class="ap-icon-sparkles"></i>
    <span>Start a chat with this Playbook</span>
  </button>
  <button type="button" class="ap-button stroked grey" data-playbook-edit>
    <i class="ap-icon-pen"></i>
    <span>Edit name</span>
  </button>
  <button type="button" class="ap-button ghost red" data-playbook-delete>
    <i class="ap-icon-trash"></i>
    <span>Delete</span>
  </button>
`;

function toast(msg) {
  import("../components/toast.js?v=20").then(({ showToast }) => showToast(msg));
}

export function renderPlaybook(params, target) {
  const id = params.id;
  renderTopbar();

  if (!getContextById(id)) {
    navigate("/contexts");
    return () => {};
  }

  // Footer action handlers — invoked by the playbook-view engine's onFooter
  // hook (the footer bar lives in the engine's sticky footer, not the body).
  const onFooter = (event) => {
    if (event.target.closest("[data-playbook-start]")) {
      // New chat pre-bound to this Playbook via ?contextId (session.js reads it).
      navigate(`/session/new-${Date.now().toString(36)}?contextId=${id}`);
      return true;
    }
    if (event.target.closest("[data-playbook-edit]")) {
      const ctx = getContextById(id);
      openRenameModal({
        title: "Rename Playbook",
        initialName: ctx?.name || "",
        placeholder: "Playbook name",
        confirmLabel: "Save name",
        onSubmit: (name) => updateContext(id, { name, updatedAt: "just now" }),
      });
      return true;
    }
    if (event.target.closest("[data-playbook-delete]")) {
      const ctx = getContextById(id);
      // Guard: every chat needs a Playbook, so never delete the last one.
      if (getContexts().length <= 1) {
        toast("Can't delete the last Playbook — every chat needs one.");
        return true;
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
      return true;
    }
    return false;
  };

  return mount(target, {
    mode: "library",
    getData: () => getContextById(id),
    isReady: () => true,
    // Edits mutate the live Context in place; commit persists + notifies.
    commit: () => {
      const ctx = getContextById(id);
      if (ctx) updateContext(id, { ...snapshotEditable(ctx), updatedAt: "just now" });
    },
    revert: (snapshot) => updateContext(id, snapshot),
    showTop: false,
    hero: {
      eyebrow: "Playbook",
      title: (d) => d.name || "Playbook",
      lead: (d) => `Everything below is what Archie uses to write for <strong>${esc(d.name || "your brand")}</strong>.`,
    },
    editHint: "Hover any card and hit the pencil to edit it — your changes save as you go.",
    // Sticky footer action bar (engine renders it outside the scroll body).
    footer: () => FOOTER_ACTIONS,
    onFooter,
  });
}
